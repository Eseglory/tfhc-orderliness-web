/* Shared by the service worker, offline workspace and React. No login tokens. */
(function (root) {
  'use strict';
  const STORES = ['operations', 'records', 'keys', 'meta', 'inbox', 'uploads'];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let unlocked = null;
  const b64 = bytes => { let text = ''; for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte); return btoa(text); };
  const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('tfhc-pwa', 2);
    request.onupgradeneeded = () => STORES.forEach(name => {
      if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
    });
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other TFHC tabs and retry.'));
  });
  async function transaction(name, run) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite'); let result;
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Local storage conflict. Reload the latest draft.')); };
      try { run(tx.objectStore(name), value => { result = value; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }
  const get = (name, id) => transaction(name, (store, done) => { const req = store.get(id); req.onsuccess = () => done(req.result); });
  const all = name => transaction(name, (store, done) => { const req = store.getAll(); req.onsuccess = () => done(req.result); });
  const put = (name, value) => transaction(name, (store, done) => { store.put(value); done(value); });
  const remove = (name, id) => transaction(name, (store, done) => { store.delete(id); done(); });
  async function owner() {
    const account = await get('meta', 'account');
    if (!account || account.expiresAt <= Date.now()) throw new Error('Reconnect and sign in to renew offline access.');
    return account.owner;
  }
  async function derive(passphrase, salt) {
    if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('Use an offline passphrase of at least 12 characters.');
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 250000 }, material,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, value, aad) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, encoder.encode(JSON.stringify(value)));
    return { iv: b64(iv), ciphertext: b64(ciphertext) };
  }
  async function unseal(key, value, aad) {
    return JSON.parse(decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(value.iv), additionalData: encoder.encode(aad) }, key, bytes(value.ciphertext))));
  }
  async function keyForOwner() {
    const id = await owner();
    if (!unlocked || unlocked.owner !== id) throw new Error('Unlock offline storage with your offline passphrase first.');
    return unlocked;
  }
  async function setAccount(id, expiresAt) {
    const current = await get('meta', 'account');
    if (current && current.owner !== id) await clearPrivate();
    await put('meta', { id: 'account', owner: id, expiresAt: Math.min(expiresAt, Date.now() + 86400000) });
  }
  async function configure(passphrase) {
    const id = await owner();
    if (await get('keys', id)) throw new Error('Offline storage already exists. Unlock it or clear this device first.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await derive(passphrase, salt);
    await put('keys', { id, salt: b64(salt), check: await seal(key, 'tfhc-offline-v1', id) });
    unlocked = { owner: id, key };
  }
  async function unlock(passphrase) {
    const id = await owner(); const config = await get('keys', id);
    if (!config) throw new Error('Set up offline storage while connected first.');
    const key = await derive(passphrase, bytes(config.salt));
    try { if (await unseal(key, config.check, id) !== 'tfhc-offline-v1') throw new Error(); }
    catch { throw new Error('The offline passphrase is incorrect.'); }
    unlocked = { owner: id, key };
  }
  async function save(name, value, expectedRevision, kind = 'draft', ttl = 7 * 86400000) {
    const account = await keyForOwner(); const id = `${account.owner}:${name}`;
    if (JSON.stringify(value).length > 2 * 1024 * 1024) throw new Error('Saved item is too large.');
    const sealed = await seal(account.key, value, id);
    return transaction('records', (store, done) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const active = req.result.filter(row => row.expiresAt > Date.now());
        for (const row of req.result) if (row.expiresAt <= Date.now()) store.delete(row.id);
        const old = active.find(row => row.id === id);
        if ((!old && active.length >= 100) || active.filter(row => row.id !== id).reduce((size, row) => size + row.ciphertext.length, sealed.ciphertext.length) > 20 * 1024 * 1024) { store.transaction.abort(); return; }
        if (expectedRevision !== undefined && (old?.revision || 0) !== expectedRevision) { store.transaction.abort(); return; }
        const record = { id, name, owner: account.owner, kind, ...sealed, revision: (old?.revision || 0) + 1,
          savedAt: Date.now(), expiresAt: Date.now() + ttl };
        store.put(record); done(record.revision);
      };
    });
  }
  async function read(name) {
    const account = await keyForOwner(); const record = await get('records', `${account.owner}:${name}`);
    if (!record) return null;
    if (record.expiresAt <= Date.now()) { await remove('records', record.id); return null; }
    return { value: await unseal(account.key, record, record.id), revision: record.revision, savedAt: record.savedAt };
  }
  async function list() {
    const account = await keyForOwner();
    const rows = await all('records');
    for (const row of rows) if (row.expiresAt <= Date.now()) await remove('records', row.id);
    return rows.filter(row => row.owner === account.owner && row.expiresAt > Date.now())
      .map(({ name, kind, savedAt, revision }) => ({ name, kind, savedAt, revision }));
  }
  async function deleteRecord(name) { return remove('records', `${await owner()}:${name}`); }
  async function clearPrivate() {
    unlocked = null;
    for (const name of STORES) await transaction(name, (store, done) => { store.clear(); done(); });
  }
  async function deviceKey() {
    const existing = await get('keys', 'inbox-device'); if (existing) return existing.key;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return transaction('keys', (store, done) => { const req = store.get('inbox-device'); req.onsuccess = () => {
      if (req.result) done(req.result.key); else { store.put({ id: 'inbox-device', key }); done(key); }
    }; });
  }
  async function receive(files, text = '') {
    if (files.length > 3 || text.length > 10000 || files.some(file => file.size > 2 * 1024 * 1024)) throw new Error('Share up to three files, each 2 MB or smaller.');
    const rows = await all('inbox');
    for (const row of rows) if (row.expiresAt <= Date.now()) await remove('inbox', row.id);
    if (rows.filter(row => row.expiresAt > Date.now()).length >= 10) throw new Error('The file inbox is full. Review or delete items first.');
    const id = crypto.randomUUID(); const account = await get('meta', 'account');
    const data = { text, files: await Promise.all(files.map(async file => ({ name: file.name.slice(0, 200), type: file.type, data: b64(await file.arrayBuffer()) }))) };
    await put('inbox', { id, owner: account?.owner || null, expiresAt: Date.now() + 600000, ...await seal(await deviceKey(), data, id) });
    return id;
  }
  async function inbox() {
    const id = await owner(); const result = [];
    for (const record of await all('inbox')) {
      if (record.expiresAt <= Date.now()) { await remove('inbox', record.id); continue; }
      if (record.owner && record.owner !== id) continue;
      const value = await unseal(await deviceKey(), record, record.id);
      result.push({ id: record.id, text: value.text, files: value.files.map(file => new File([bytes(file.data)], file.name, { type: file.type })) });
    }
    return result;
  }
  async function sync() {
    const account = await get('meta', 'account');
    if (!account || account.expiresAt <= Date.now()) return;
    let retry = false;
    for (const candidate of await all('operations')) {
      if (candidate.expiresAt <= Date.now()) { await remove('operations', candidate.id); continue; }
      if (candidate.owner !== account.owner || candidate.state !== 'pending') continue;
      const row = await transaction('operations', (store, done) => {
        const req = store.get(candidate.id); req.onsuccess = () => {
          const item = req.result;
          if (!item || item.state !== 'pending' || item.leaseUntil > Date.now() || item.nextAttemptAt > Date.now()) return done(null);
          item.leaseUntil = Date.now() + 60000; store.put(item); done(item);
        };
      });
      if (!row) { retry = true; continue; }
      let status = 0;
      try {
        if (!Array.isArray(row.notificationIds) || !row.notificationIds.length || row.notificationIds.length > 100) { status = 400; throw new Error(); }
        const response = await fetch('/api/pwa/sync', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner: row.owner, ids: row.notificationIds }), signal: AbortSignal.timeout(15000) });
        status = response.status;
        if (!response.ok) throw new Error();
        await remove('operations', row.id);
      } catch {
        row.attempts++; row.leaseUntil = 0;
        row.state = status === 409 ? 'conflict' : (status >= 400 && status < 500 && ![401, 408, 429].includes(status)) || row.attempts >= 8 ? 'failed' : 'pending';
        row.nextAttemptAt = Date.now() + Math.min(300000, 2000 * 2 ** Math.min(row.attempts, 7)) + Math.random() * 1000;
        await transaction('operations', (store, done) => { const req = store.get(row.id); req.onsuccess = () => { if (req.result) store.put(row); done(); }; });
        if (row.state === 'pending') retry = true;
        if (status === 401) { await remove('meta', 'background'); break; }
      }
    }
    if (root.clients) for (const client of await root.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'BACKGROUND_SYNC_COMPLETE', pending: retry });
    if (retry) throw new Error('Pending synchronization will retry.');
  }
  root.TFHCPwa = { get, put, all, remove, owner, setAccount, configure, unlock, lock: () => { unlocked = null; },
    isUnlocked: () => Boolean(unlocked), save, read, list, deleteRecord, clearPrivate, receive, inbox, sync };
})(globalThis);
