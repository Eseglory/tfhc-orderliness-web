import { ApiError, fetchApi, getAuthToken } from '../api';
import type { ChatMessage } from '../chat';
import { pwaRuntime } from './runtime';
import { recordPwaMetric } from './metrics';
import { compressImageIfNeeded } from '../image-compress';

export async function cancelUpload(roomId: string, file: File) {
  const token = getAuthToken();
  if (!token) throw new Error('Sign in to cancel this upload.');
  const owner = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map(byte => byte.toString(16).padStart(2, '0')).join('');
  const store = await pwaRuntime(); const key = `${owner}:${roomId}:${hash}`;
  const meta = await store.get('uploads', key);
  if (!meta) return;
  if (getAuthToken() !== token) throw new Error('The account changed.');
  await fetchApi(`/chat/uploads/${meta.uploadId}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
  await store.remove('uploads', key);
}

export async function resumableUpload(roomId: string, inputFile: File, options: { signal?: AbortSignal; progress?(percent: number): void; replyToId?: string } = {}) {
  const file = await compressImageIfNeeded(inputFile);
  if (file.size < 1 || file.size > 3 * 1024 * 1024) throw new Error('Choose a file of 3 MB or smaller.');
  const token = getAuthToken();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map(byte => byte.toString(16).padStart(2, '0')).join('');
  const owner = JSON.parse(atob((token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
  const store = await pwaRuntime(); const key = `${owner}:${roomId}:${hash}`;
  let meta = await store.get('uploads', key);
  if (!meta || meta.expiresAt <= Date.now()) {
    meta = { id: key, uploadId: crypto.randomUUID(), owner, roomId, hash, expiresAt: Date.now() + 86400000 };
    await store.put('uploads', meta);
  } else recordPwaMetric('upload_resume');
  const check = () => {
    options.signal?.throwIfAborted();
    if (getAuthToken() !== token) throw new Error('The account changed. Sign in and select the file again.');
    if (!navigator.onLine) throw new Error('Upload paused while offline. Retry or select the same file to resume.');
  };
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      check();
      try { return await fetchApi<T>(path, { ...init, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }); }
      catch (error) {
        last = error;
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
    throw last;
  }
  let state = await request<{ uploadId: string; offset: number; chunkSize: number }>('/chat/uploads', { method: 'POST', body: JSON.stringify({
    uploadId: meta.uploadId, roomId, sha256: hash, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, replyToId: options.replyToId,
  }) });
  while (state.offset < file.size) {
    check();
    const form = new FormData(); form.append('offset', String(state.offset));
    form.append('chunk', file.slice(state.offset, state.offset + state.chunkSize), 'chunk');
    try { state = await request(`/chat/uploads/${state.uploadId}/chunks`, { method: 'POST', body: form }); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      state = await request(`/chat/uploads/${state.uploadId}`);
    }
    options.progress?.(Math.round(state.offset / file.size * 100));
  }
  const message = await request<ChatMessage>(`/chat/uploads/${state.uploadId}/complete`, { method: 'POST' });
  await store.remove('uploads', key);
  if (message?.attachmentUrl) {
    try {
      await store.save(`file:${message.id}`, {
        id: message.id,
        url: message.attachmentUrl,
        meta: message.attachmentMeta,
        name: file.name,
        size: file.size,
        type: file.type,
      }, undefined, 'media', 14 * 86400000);
    } catch {}
  }
  return message;
}
