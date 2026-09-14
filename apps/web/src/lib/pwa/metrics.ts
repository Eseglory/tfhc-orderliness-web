import { onCLS, onINP, onLCP } from 'web-vitals';
const pending: { name: string; value: number; connection?: string }[] = [];
export function recordPwaMetric(name: string, value = 1) {
  if (navigator.doNotTrack === '1') return;
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  pending.push({ name, value: Math.round(value * 1000) / 1000, connection });
  if (pending.length > 20) pending.shift();
}
export function flushMetrics() {
  if (!pending.length || !navigator.onLine) return;
  const events = pending.splice(0);
  void fetch('/api/pwa/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }), keepalive: true }).catch(() => undefined);
}
let started = false;
export function startMetrics() {
  if (started) return; started = true;
  onCLS(metric => recordPwaMetric('CLS', metric.value));
  onINP(metric => recordPwaMetric('INP', metric.value));
  onLCP(metric => recordPwaMetric('LCP', metric.value));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushMetrics(); });
  window.addEventListener('online', () => { recordPwaMetric('online'); flushMetrics(); });
  window.addEventListener('offline', () => recordPwaMetric('offline'));
}
