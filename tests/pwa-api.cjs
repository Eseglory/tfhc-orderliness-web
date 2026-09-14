// Local protocol fixture only. Production security is exercised by API tests.
const http = require('node:http');
const calls = [];
http.createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  let body = ''; for await (const chunk of request) body += chunk;
  if (request.url === '/health') return response.end('{}');
  if (request.url === '/pwa/session' && request.method === 'POST') {
    if (!request.headers.authorization?.startsWith('Bearer ')) { response.statusCode = 401; return response.end('{}'); }
    return response.end(JSON.stringify({ grant: 'test-background-grant', expiresAt: new Date(Date.now() + 3600000).toISOString() }));
  }
  if (request.url === '/pwa/sync') {
    if (request.headers['x-pwa-grant'] !== 'test-background-grant') { response.statusCode = 401; return response.end('{}'); }
    calls.push(JSON.parse(body)); return response.end('{"count":1}');
  }
  if (request.url === '/calls') return response.end(JSON.stringify(calls));
  if (request.url === '/pwa/session' && request.method === 'DELETE') return response.end('{}');
  if (request.url === '/pwa/metrics') return response.end('{}');
  response.statusCode = 404; response.end('{}');
}).listen(4201, '127.0.0.1');
