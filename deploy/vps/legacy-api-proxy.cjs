// Compatibility endpoint only: no database client, jobs, migrations or retries.
const http = require('node:http');
const https = require('node:https');

function createProxy(target) {
  const upstream = new URL(target);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password)
    throw Error('INVALID_UPSTREAM');
  const transport = upstream.protocol === 'https:' ? https : http;
  const agent = new transport.Agent({ keepAlive: true, maxSockets: 64 });
  function options(req, upgrade = false) {
    const headers = { ...req.headers, host: upstream.host };
    // Do not forward hop-by-hop headers supplied by arbitrary callers.
    for (const key of (headers.connection || '').split(',')) delete headers[key.trim().toLowerCase()];
    delete headers['proxy-authorization']; delete headers['proxy-connection'];
    delete headers['keep-alive']; delete headers['transfer-encoding'];
    if (upgrade) { headers.connection = 'Upgrade'; headers.upgrade = 'websocket'; }
    else delete headers.connection;
    return { protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port,
      path: upstream.pathname.replace(/\/$/, '') + req.url, method: req.method, headers, agent };
  }
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ status: 'ok', role: 'compatibility-proxy', databaseWriter: false }));
    }
    const outgoing = transport.request(options(req), incoming => {
      res.writeHead(incoming.statusCode, { ...incoming.headers, 'x-tfhc-proxy': 'v1' });
      incoming.pipe(res);
      incoming.on('error', () => res.destroy());
    });
    outgoing.setTimeout(90000, () => outgoing.destroy());
    outgoing.on('error', () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '30', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ message: 'Service temporarily unavailable. Please retry shortly.' }));
    });
    req.on('aborted', () => outgoing.destroy());
    res.on('close', () => { if (!res.writableFinished) outgoing.destroy(); });
    req.pipe(outgoing);
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.headers.upgrade?.toLowerCase() !== 'websocket') return socket.destroy();
    const outgoing = transport.request(options(req, true));
    const timeout = setTimeout(() => outgoing.destroy(), 15000);
    outgoing.on('upgrade', (response, remote, remoteHead) => {
      clearTimeout(timeout);
      const headers = Object.entries(response.headers).flatMap(([key, value]) =>
        (Array.isArray(value) ? value : [value]).map(item => `${key}: ${item}`));
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join('\r\n')}\r\n\r\n`);
      if (remoteHead.length) socket.write(remoteHead);
      if (head.length) remote.write(head);
      remote.on('error', () => socket.destroy()); socket.on('error', () => remote.destroy());
      remote.on('close', () => socket.destroy()); socket.on('close', () => remote.destroy());
      remote.pipe(socket); socket.pipe(remote);
    });
    outgoing.on('response', () => { clearTimeout(timeout); socket.destroy(); outgoing.destroy(); });
    outgoing.on('error', () => { clearTimeout(timeout); socket.destroy(); });
    socket.on('error', () => outgoing.destroy());
    outgoing.end();
  });
  server.on('close', () => agent.destroy());
  return server;
}
module.exports = { createProxy };
if (require.main === module) {
  createProxy('https://staging.utilityhub.ng/tfhc').listen(Number(process.env.PORT || 4000), '0.0.0.0');
}
