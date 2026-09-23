/* Read an offline SQLite snapshot; benchmark migrations/queries on a disposable copy only.
 * Usage: node scripts/benchmark-chat-storage.cjs /absolute/path/to/snapshot.db
 */
require('reflect-metadata');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { DatabaseSync } = require('node:sqlite');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node', target: 'ES2021', experimentalDecorators: true, emitDecoratorMetadata: true } });
const { ChatBufferRepository } = require('../apps/api/src/modules/chat/chat-buffer.repository');
const { ConfigService } = require('@nestjs/config');
const snapshot = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(snapshot)) throw new Error('Provide a consistent, offline SQLite backup.');
if (fs.existsSync(snapshot + '-wal')) throw new Error('Use a SQLite backup, not an active WAL database.');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfhc-chat-benchmark-'));
const copy = path.join(dir, 'chat.db');
fs.copyFileSync(snapshot, copy);
let db = new DatabaseSync(copy);
const checksum = () => crypto.createHash('sha256').update(JSON.stringify(db.prepare('SELECT * FROM chat_message_buffer ORDER BY id').all())).digest('hex');
const beforeChecksum = checksum();
const room = db.prepare('SELECT room_id, COUNT(*) AS count FROM chat_message_buffer GROUP BY room_id ORDER BY count DESC LIMIT 1').get();
if (!room) throw new Error('The snapshot is empty; no performance claim can be made.');
const count = db.prepare('SELECT COUNT(*) AS count FROM chat_message_buffer').get().count;
function measure(run) {
  for (let i = 0; i < 20; i++) run();
  const samples = [];
  for (let i = 0; i < 500; i++) { const start = performance.now(); run(); samples.push(performance.now() - start); }
  samples.sort((a,b)=>a-b);
  return { samples: samples.length, p50Ms: samples[249], p95Ms: samples[474] };
}
const sql = 'SELECT * FROM chat_message_buffer WHERE room_id = ? ORDER BY created_at DESC LIMIT 51';
const before = measure(() => db.prepare(sql).all(room.room_id));
const beforePlan = db.prepare('EXPLAIN QUERY PLAN ' + sql).all(room.room_id).map(row => row.detail);
const repository = new ChatBufferRepository(new ConfigService());
repository.initDatabase(copy);
db.close();
db = new DatabaseSync(copy);
const after = measure(() => repository.listMessages(room.room_id, 50));
const afterPlan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM chat_message_buffer WHERE room_id = ? ORDER BY created_at DESC, id DESC LIMIT 51').all(room.room_id).map(row => row.detail);
const afterChecksum = checksum();
const messages = db.prepare('SELECT id, body, attachment_url AS attachmentUrl, attachment_meta AS attachmentMeta, created_at AS createdAt FROM chat_message_buffer WHERE room_id = ? ORDER BY created_at DESC, id DESC LIMIT 50').all(room.room_id);
const report = { sourceRecords: count, largestConversationRecords: room.count, sqlitePageBefore: before, sqlitePageAfter: after,
  beforePlan, afterPlan, beforeChecksum, afterChecksum, recordsUnchanged: beforeChecksum === afterChecksum,
  storedMessageProjectionBytes: Buffer.byteLength(JSON.stringify(messages)),
  compactProjectionBytes: Buffer.byteLength(JSON.stringify(messages.map(m => ({...m, attachmentUrl: m.attachmentUrl?.startsWith('data:') ? `/chat/messages/${m.id}/attachment` : m.attachmentUrl})))),
  scope: 'Existing snapshot only. No generated history. Before is the prior raw SQLite page query; after includes repository row mapping. Not a browser or production-network benchmark.' };
repository.close();db.close();
console.log(JSON.stringify(report, null, 2));
if (!report.recordsUnchanged) process.exitCode = 1;
