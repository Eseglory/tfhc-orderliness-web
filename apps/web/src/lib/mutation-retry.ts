// Store only request fingerprints and random IDs, never bodies or credentials.
const pending = new Map<string, string>();
export async function mutationRetry(actor: string, url: string, method: string, body?: BodyInit | null) {
  if (typeof window === 'undefined' || !globalThis.crypto?.subtle || ['GET', 'HEAD', 'OPTIONS'].includes(method) || /\/auth\//.test(url)) return undefined;
  const hash = async (value: string | ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    typeof value === 'string' ? new TextEncoder().encode(value) : value))).map(byte => byte.toString(16).padStart(2, '0')).join('');
  let payload: string;
  if (typeof body === 'string' || body == null) payload = body || '';
  else if (body instanceof FormData) {
    const fields: unknown[] = [];
    for (const [name, value] of body.entries()) fields.push([name, typeof value === 'string' ? value :
      { name: value.name, type: value.type, digest: await hash(await value.arrayBuffer()) }]);
    payload = JSON.stringify(fields);
  } else return undefined;
  const fingerprint = 'tfhc_pending_write_' + await hash(JSON.stringify([actor, url, method, payload]));
  let key = pending.get(fingerprint);
  try { key ||= sessionStorage.getItem(fingerprint) || undefined; } catch {}
  key ||= crypto.randomUUID();
  pending.set(fingerprint, key);
  try { sessionStorage.setItem(fingerprint, key); } catch {}
  return { key, complete: () => {
    pending.delete(fingerprint);
    try { sessionStorage.removeItem(fingerprint); } catch {}
  } };
}
