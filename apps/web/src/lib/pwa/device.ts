import { fetchApi, getAuthToken } from '../api';
import { pwaRuntime } from './runtime';
let preparing: Promise<void> | undefined;
export function prepareDevice() {
  return preparing ||= (async () => {
    const token = getAuthToken(); if (!token || !navigator.onLine) return;
    const user = await fetchApi<{ userId: string }>('/auth/me', { signal: AbortSignal.timeout(15000) });
    if (getAuthToken() !== token) return;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const store = await pwaRuntime();
    await store.setAccount(user.userId, payload.exp * 1000);
    const current = await store.get('meta', 'background');
    if (!current || current.owner !== user.userId || current.expiresAt < Date.now() + 300000) {
      const response = await fetch('/api/pwa/session', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin', signal: AbortSignal.timeout(15000) });
      if (!response.ok) return;
      const result = await response.json();
      if (getAuthToken() !== token) return;
      await store.put('meta', { id: 'background', owner: user.userId, expiresAt: new Date(result.expiresAt).getTime() });
    }
  })().finally(() => { preparing = undefined; });
}
export async function clearDevice() {
  const store = await pwaRuntime();
  await store.clearPrivate();
  void fetch('/api/pwa/session', { method: 'DELETE', credentials: 'same-origin', keepalive: true }).catch(() => undefined);
}
