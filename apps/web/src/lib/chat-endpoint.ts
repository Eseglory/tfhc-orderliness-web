/** Keep the Socket.IO namespace separate from a reverse-proxy URL prefix. */
export function chatEndpoint(apiBase: string) {
  const url = new URL(apiBase);
  const prefix = url.pathname.replace(/\/+$/, '');
  return { namespace: `${url.origin}/chat`, path: `${prefix}/socket.io` };
}
