import { fetchApi, getAuthToken } from './api';

const pending = new Map<string, { token: string | null; request: Promise<unknown> }>();

/** Navigation badges and the open chat share reads without caching stale results. */
export function sharedChatRead<T>(path: string): Promise<T> {
  const token = getAuthToken();
  const existing = pending.get(path);
  if (existing?.token === token) return existing.request as Promise<T>;
  const request = fetchApi<T>(path).finally(() => {
    if (pending.get(path)?.request === request) pending.delete(path);
  });
  pending.set(path, { token, request });
  return request;
}
