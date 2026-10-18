import { getApiBaseUrl } from './api';

export function resolveProfileImage(url?: string | null): string | undefined {
  const value = url?.trim();
  if (!value) return undefined;
  // Member photos are API resources, not Next.js routes. Keep local assets,
  // uploaded previews and external provider photos on their original origins.
  if (/^\/?members\//.test(value)) {
    const resolved = new URL(`${getApiBaseUrl().replace(/\/$/, '')}/${value.replace(/^\//, '')}`);
    // Bypass legacy immutable responses carrying the old same-origin header.
    if (!resolved.searchParams.has('v')) resolved.searchParams.set('v', '2');
    return resolved.toString();
  }
  return value;
}
