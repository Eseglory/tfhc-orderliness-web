import { ApiError, fetchApi, getAuthToken } from '../api';

const DB_NAME = 'tfhc-pwa';
const STORE = 'operations';
const TTL = 7 * 24 * 60 * 60 * 1000;
export const QUEUE_EVENT = 'tfhc:queue';
export type Operation = {
  id: string; owner: string; notificationIds: string[]; createdAt: number;
  expiresAt: number; attempts: number; nextAttemptAt: number;
  state: 'pending' | 'failed' | 'conflict'; leaseUntil: number;
};
export type QueueStatus = { pending: number; failed: number; syncing: boolean; message: string };
let syncing = false;
let message = '';
let generation = 0;
const signal = (type = 'queue-changed') => {
  if (type === 'notification-reads-synced') window.dispatchEvent(new Event('tfhc:notifications-synced'));
  window.dispatchEvent(new Event(QUEUE_EVENT));
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('tfhc-pwa');
    channel.postMessage(type); channel.close();
  }
};
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['operations', 'records', 'keys', 'meta', 'inbox', 'uploads']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other app tabs to enable local storage.'));
  });
}
async function transaction<T>(work: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    let result: T;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Local storage unavailable.')); };
    try { work(tx.objectStore(STORE), value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}
// This only partitions local IDs. The server revalidates the token before replay.
export function queueOwner(): string | null {
  try {
    const token = getAuthToken();
    if (!token) return null;
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part));
    return typeof payload.sub === 'string' && payload.exp * 1000 > Date.now() ? payload.sub : null;
  } catch { return null; }
}
export async function listOperations(): Promise<Operation[]> {
  const owner = queueOwner();
  return transaction((store, done) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const valid: Operation[] = [];
      for (const row of request.result as Operation[]) {
        if (row.expiresAt <= Date.now()) {
          store.delete(row.id);
          if (row.owner === owner) message = 'Expired notification reads removed. Review Activity for unread items.';
        }
        else if (row.owner === owner) valid.push(row);
      }
      done(valid);
    };
  });
}
export async function queueStatus(): Promise<QueueStatus> {
  const rows = await listOperations();
  return { pending: rows.filter(row => row.state === 'pending').length,
    failed: rows.filter(row => row.state !== 'pending').length, syncing, message };
}
export async function clearOperations() {
  generation++;
  message = '';
  await transaction<void>((store, done) => { store.clear(); done(); });
  signal();
}
export async function discardFailed() {
  const owner = queueOwner();
  await transaction<void>((store, done) => {
    const request = store.getAll();
    request.onsuccess = () => {
      for (const row of request.result as Operation[]) {
        if (row.owner === owner && row.state !== 'pending') store.delete(row.id);
      }
      done();
    };
  });
  signal();
}
export async function enqueueNotificationReads(ids: string[]) {
  const owner = queueOwner();
  if (!owner) throw new Error('Sign in again before saving notification reads.');
  if (!ids.length || ids.length > 100 || ids.some(id => !/^[a-zA-Z0-9-]{1,100}$/.test(id))) {
    throw new Error('Select up to 100 valid notifications.');
  }
  const epoch = generation;
  await transaction<void>((store, done) => {
    const request = store.getAll();
    request.onsuccess = () => {
      if (generation !== epoch || queueOwner() !== owner) { store.transaction.abort(); return; }
      const rows = request.result as Operation[];
      const current = rows.filter(row => row.expiresAt > Date.now());
      rows.filter(row => row.expiresAt <= Date.now()).forEach(row => store.delete(row.id));
      if (current.length >= 100) { store.transaction.abort(); return; }
      store.put({ id: crypto.randomUUID(), owner, notificationIds: [...new Set(ids)],
        createdAt: Date.now(), expiresAt: Date.now() + TTL, attempts: 0,
        nextAttemptAt: 0, state: 'pending', leaseUntil: 0 } satisfies Operation);
      done();
    };
  });
  message = 'Notification reads saved on this device. Changes pending.';
  signal();
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistration().then(registration => {
      const sync = (registration as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | undefined)?.sync;
      return sync?.register('tfhc-notification-reads');
    }).catch(() => undefined);
  }
  void flushQueue();
}
async function claim(id: string): Promise<Operation | null> {
  return transaction((store, done) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const row = request.result as Operation | undefined;
      if (!row || row.owner !== queueOwner() || row.state !== 'pending' || row.leaseUntil > Date.now() || row.nextAttemptAt > Date.now()) return done(null);
      row.leaseUntil = Date.now() + 60000;
      store.put(row); done(row);
    };
  });
}
export async function flushQueue() {
  if (syncing || !navigator.onLine || !queueOwner()) return;
  syncing = true;
  let completed = false;
  const epoch = generation;
  const token = getAuthToken();
  const owner = queueOwner();
  try {
    const rows = await listOperations();
    if (!rows.some(row => row.state === 'pending' && row.nextAttemptAt <= Date.now())) return;
    signal();
    // Do not trust cached roles or a decoded JWT as authorization.
    const user = await fetchApi<{ userId: string }>('/auth/me', { signal: AbortSignal.timeout(15000) });
    if (user.userId !== owner || getAuthToken() !== token || epoch !== generation) return;
    for (const candidate of rows) {
      if (getAuthToken() !== token || epoch !== generation) break;
      const row = await claim(candidate.id);
      if (!row) continue;
      try {
        if (getAuthToken() !== token || epoch !== generation) break;
        await fetchApi('/members/me/notifications/read', { method: 'PUT',
          body: JSON.stringify({ ids: row.notificationIds }), signal: AbortSignal.timeout(15000) });
        await transaction<void>((store, done) => { store.delete(row.id); done(); });
        completed = true;
        message = 'Sync completed.';
      } catch (error) {
        const status = error instanceof ApiError ? error.status : 0;
        row.attempts++;
        row.leaseUntil = 0;
        row.nextAttemptAt = Date.now() + Math.min(300000, 2000 * 2 ** Math.min(row.attempts, 7)) + Math.random() * 1000;
        row.state = status === 409 ? 'conflict' :
          (status >= 400 && status < 500 && ![401, 408, 429].includes(status)) || row.attempts >= 8 ? 'failed' : 'pending';
        await transaction<void>((store, done) => {
          // Never resurrect an operation removed by logout or another tab.
          const request = store.get(row.id);
          request.onsuccess = () => {
            if (request.result && epoch === generation && getAuthToken() === token) store.put(row);
            done();
          };
        });
        message = status === 401 ? 'Sign in again to sync.' : row.state === 'conflict' ?
          'Sync conflict. Refresh Activity and review unread items.' : row.state === 'failed' ?
          'Sync failed. Refresh Activity and review unread items.' : 'Connection interrupted. Changes pending; retrying automatically.';
        if (status === 401 || !status) break;
      }
    }
  } catch (error) {
    message = error instanceof ApiError && error.status === 401 ? 'Sign in again to sync.' : 'Changes pending. Waiting for the server.';
  } finally {
    syncing = false;
    signal(completed ? 'notification-reads-synced' : 'queue-changed');
  }
}
