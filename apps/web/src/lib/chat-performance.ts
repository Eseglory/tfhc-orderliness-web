/** Opt-in timing events contain operation names and durations, never chat content. */
export function chatTiming(operation: string, startedAt: number) {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem('tfhc:chat-performance') !== 'true') return;
    window.dispatchEvent(new CustomEvent('tfhc:chat-performance', {
      detail: { operation, durationMs: performance.now() - startedAt },
    }));
  } catch { /* Instrumentation must not affect chat. */ }
}
