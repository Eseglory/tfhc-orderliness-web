import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// Dropping real connections exercises service workers in every browser engine;
// WebKit's automation offline switch can reject before service-worker dispatch.
export async function offlineProxy(upstream: string) {
  let disconnected = false;
  const server = createServer(async (request, response) => {
    if (disconnected) { request.socket.destroy(); return; }
    try {
      const result = await fetch(`${upstream}${request.url}`, { redirect: 'manual' });
      response.statusCode = result.status;
      for (const key of ['content-type', 'cache-control', 'location']) {
        const value = result.headers.get(key);
        if (value) response.setHeader(key, value);
      }
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.destroy(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    disconnect() { disconnected = true; server.closeAllConnections(); },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
