import { getAuthToken } from './api';

export interface QueuedChatMessage {
  clientId: string;
  roomId: string;
  body: string;
  replyToId?: string;
  createdAt: string;
}

function account() {
  const token = getAuthToken();
  if (!token) throw new Error('Sign in before saving a message.');
  return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub as string;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tfhc-chat-outbox', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('keys');
      request.result.createObjectStore('messages', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = run(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('Device storage unavailable')); };
  });
}
async function deviceKey(owner: string): Promise<CryptoKey> {
  const existing = await transaction<CryptoKey | undefined>('keys', 'readonly', s => s.get(owner));
  if (existing) return existing;
  const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  // add, not put: a second tab cannot replace the key of already saved messages.
  try { await transaction('keys', 'readwrite', s => s.add(candidate, owner)); return candidate; }
  catch {
    const winner = await transaction<CryptoKey | undefined>('keys', 'readonly', s => s.get(owner));
    if (!winner) throw new Error('Unable to secure device storage');
    return winner;
  }
}
export async function queueChatMessage(message: QueuedChatMessage) {
  const owner = account();
  if (message.body.length > 4000) throw new Error('Message is too long');
  const key = await deviceKey(owner);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const id = `${owner}:${message.clientId}`;
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) }, key, new TextEncoder().encode(JSON.stringify(message)));
  if (account() !== owner) throw new Error('Account changed');
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const request = store.getAll();
    request.onsuccess = () => {
      if (request.result.filter(row => row.owner === owner && row.id !== id).length >= 100) { tx.abort(); return; }
      store.put({ id, owner, iv, ciphertext });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Device queue is full or unavailable. Keep this message and try again.')); };
  });
}
export async function queuedChatMessages(): Promise<QueuedChatMessage[]> {
  const owner = account();
  const rows = await transaction<any[]>('messages', 'readonly', s => s.getAll());
  const own = rows.filter(row => row.owner === owner);
  if (!own.length) return [];
  const key = await deviceKey(owner);
  const result = await Promise.all(own.map(async row => JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: row.iv, additionalData: new TextEncoder().encode(row.id) }, key, row.ciphertext,
  ))) as QueuedChatMessage));
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function acknowledgeChatMessage(clientId: string) {
  await transaction('messages', 'readwrite', s => s.delete(`${account()}:${clientId}`));
}
