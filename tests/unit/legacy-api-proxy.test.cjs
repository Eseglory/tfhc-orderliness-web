const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createProxy } = require('../../deploy/vps/legacy-api-proxy.cjs');
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
function cleanup(t, server) {
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  t.after(() => { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); server.close(); });
}
test('streams mutations, authorization, retry keys and query strings exactly once', async t => {
  let calls = 0;
  const upstream = http.createServer(async (req, res) => {
    calls++; let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(req.url, '/tfhc/chat/messages?cursor=a%2Fb');
    assert.equal(req.headers.authorization, 'Bearer synthetic');
    assert.equal(req.headers['idempotency-key'], 'synthetic-operation');
    res.writeHead(201, { 'content-type': 'application/json' }); res.end(body);
  }); cleanup(t, upstream);
  const proxy = createProxy(await listen(upstream) + '/tfhc'); cleanup(t, proxy);
  const response = await fetch(await listen(proxy) + '/chat/messages?cursor=a%2Fb', {
    method: 'POST', headers: { authorization: 'Bearer synthetic', 'idempotency-key': 'synthetic-operation' }, body: '{"message":"test"}' });
  assert.equal(response.status, 201); assert.equal(await response.text(), '{"message":"test"}'); assert.equal(calls, 1);
});
test('failed mutations are not retried and local health confirms no database writer', async t => {
  let calls = 0;
  const upstream = http.createServer(req => { calls++; req.socket.destroy(); }); cleanup(t, upstream);
  const proxy = createProxy(await listen(upstream) + '/tfhc'); cleanup(t, proxy); const base = await listen(proxy);
  assert.equal((await fetch(base + '/payment', { method: 'POST', body: 'test' })).status, 503);
  assert.equal(calls, 1);
  assert.equal((await (await fetch(base + '/health')).json()).databaseWriter, false);
});
test('WebSocket upgrade preserves namespace transport path and streams data', async t => {
  const upstream = http.createServer(); cleanup(t, upstream);
  upstream.on('upgrade', (req, socket) => {
    assert.equal(req.url, '/tfhc/socket.io/?EIO=4&transport=websocket');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.on('data', data => socket.write(data));
  });
  const proxy = createProxy(await listen(upstream) + '/tfhc'); cleanup(t, proxy);
  const request = http.get(await listen(proxy) + '/socket.io/?EIO=4&transport=websocket', { headers: { connection: 'Upgrade', upgrade: 'websocket' } });
  const [, socket] = await once(request, 'upgrade');
  t.after(() => socket.destroy());
  socket.write('test'); const [data] = await once(socket, 'data'); assert.equal(data.toString(), 'test'); socket.destroy();
});
