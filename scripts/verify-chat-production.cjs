/* Read-only production verification: no messages, notifications or attendance are created. */
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { io } = require('socket.io-client');
const config = { ...dotenv.parse(fs.readFileSync('apps/api/.env')), ...process.env };
const base = 'https://tfhc-orderliness-api.onrender.com';
const db = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
async function json(route, options = {}) {
  const start = performance.now();
  const response = await fetch(base + route, { ...options, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${route.split('?')[0]} returned ${response.status}`);
  return { data: await response.json(), ms: performance.now() - start };
}
async function ready(socket) {
  return new Promise((resolve, reject) => {
    const done = (error) => { clearTimeout(timer); socket.off('ready', ok); socket.off('connect_error', fail); error ? reject(error) : resolve(); };
    const ok = () => done();
    const fail = () => done(new Error('Authenticated realtime connection failed'));
    const timer = setTimeout(() => done(new Error('Realtime ready timeout')), 20000);
    socket.once('ready', ok); socket.once('connect_error', fail);
  });
}
async function main() {
  const report = { verifiedAt: new Date().toISOString(), operations: 'read-only; authenticated socket connect/reconnect; no test messages' };
  report.health = await json('/health');
  const login = await json('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: config.BOOTSTRAP_ADMIN_EMAIL, password: config.BOOTSTRAP_ADMIN_PASSWORD }) });
  const headers = { Authorization: `Bearer ${login.data.accessToken}` };
  const unauthorized = await fetch(base + '/chat/rooms', { signal: AbortSignal.timeout(20000) });
  if (unauthorized.status !== 401) throw new Error('Anonymous chat access did not return 401');
  report.anonymousAccessDenied = true;
  report.storage = (await json('/chat/sync/status', { headers })).data;
  const primary = await db.chatMessage.findMany();
  const byId = new Map(primary.map(row => [row.id, row]));
  report.primaryMessages = primary.length;
  const rooms = await json('/chat/rooms?compactMedia=true', { headers });
  report.roomListMs = rooms.ms;
  const seen = new Set(), latencies = [];
  let epochCursors = true;
  for (const room of rooms.data) {
    let cursor;
    do {
      const page = await json(`/chat/rooms/${room.id}/messages?limit=50${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, { headers });
      latencies.push(page.ms);
      epochCursors = epochCursors && /^[a-f0-9-]{36}:\d+$/.test(page.data.syncCursor);
      for (const message of page.data.messages) {
        if (seen.has(message.id)) throw new Error('Duplicate message across paginated room reads');
        seen.add(message.id);
        const saved = byId.get(message.id);
        if (!saved || saved.roomId !== message.roomId || saved.body !== message.body || saved.attachmentUrl !== message.attachmentUrl) throw new Error('SQLite/API message content differs from primary');
      }
      cursor = page.data.hasMore ? page.data.nextCursor : null;
      if (page.data.hasMore && !cursor) throw new Error('Invalid pagination cursor');
    } while (cursor);
  }
  const member = await db.member.findFirstOrThrow({ where: { user: { email: config.BOOTSTRAP_ADMIN_EMAIL } }, select: { id: true } });
  const hidden = new Set((await db.chatMessageHidden.findMany({ where: { memberId: member.id }, select: { messageId: true } })).map(row => row.messageId));
  const authorizedRooms = new Set(rooms.data.map(room => room.id));
  const missing = primary.filter(row => authorizedRooms.has(row.roomId) && !hidden.has(row.id) && !seen.has(row.id));
  if (missing.length) throw new Error(`${missing.length} primary messages are missing from authorized API history`);
  report.messagesComparedIncludingTombstones = seen.size;
  report.restartSafeCursors = epochCursors;
  report.roomCount = rooms.data.length;
  latencies.sort((a,b) => a-b);
  report.messagePageMs = { samples: latencies.length, p50: latencies[Math.floor(latencies.length / 2)], max: latencies.at(-1) };
  const socket = io(base + '/chat', { transports: ['websocket'], auth: { token: login.data.accessToken }, autoConnect: false, reconnection: true, reconnectionDelay: 250, reconnectionDelayMax: 1000 });
  try {
    let start = performance.now(); const connected = ready(socket); socket.connect(); await connected;
    report.websocketConnectMs = performance.now() - start;
    start = performance.now(); const recovered = ready(socket); socket.io.engine.close(); await recovered;
    report.websocketReconnectMs = performance.now() - start;
  } finally { socket.disconnect(); socket.io.removeAllListeners(); }
  if (report.storage.pendingCount || report.storage.processingCount || report.storage.failedCount) throw new Error('Production has pending/failed SQLite writes; inspect before deploying');
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
