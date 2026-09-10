/**
 * Resolve to the promise's value, or `fallback` if it takes longer than `ms`.
 * The slow promise is never left to reject unhandled — it is drained in the
 * background. Used so a stalled SMTP handshake can't hold an interactive
 * request open.
 */
export function settleWithin<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const guarded = promise.catch(() => fallback);
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([guarded, timeout]).finally(() => clearTimeout(timer));
}
