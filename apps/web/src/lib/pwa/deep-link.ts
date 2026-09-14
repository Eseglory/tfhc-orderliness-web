/** Only application paths can be resumed; this never accepts an external URL. */
export function safeDestination(value: string | null, staff: boolean): string {
  const fallback = staff ? '/admin' : '/member';
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://tfhc.invalid');
    if (url.origin !== 'https://tfhc.invalid') return fallback;
    if (!/^\/member(?:\/|$)/.test(url.pathname) && !(staff && /^\/admin(?:\/|$)/.test(url.pathname))) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
