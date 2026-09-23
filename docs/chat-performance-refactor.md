# Chat performance and reliability refactor

## Scope and architecture

Implemented in the existing chat module, without new dependencies or destructive migrations. The existing architecture uses **server-side SQLite**, PostgreSQL, Socket.IO, browser conversation caching and an encrypted IndexedDB outbox. This change retains that architecture; it does not introduce SQLite WASM into the browser. Cached conversations render locally while authorized background requests reconcile changes.

Flow: optimistic UI → durable encrypted device outbox → authenticated socket/HTTP → SQLite transaction → recipient socket event. PostgreSQL persistence and notification work run asynchronously. Noon and midnight reconciliation remains enabled in Africa/Lagos time.

## Root causes and changes

- The same recipient received both member-room and direct socket emissions. Removed the duplicate fanout; the browser benchmark changed from two events per message to one.
- Unbounded mounted history, eager media and repeated room/member/read requests added avoidable work. Added variable-height windowing, bounded cursor pages, debounced room refresh, lazy member loading and authenticated on-demand attachment retrieval. Legacy attachment responses remain available; compact media is opt-in.
- Device state needed durable, account-scoped recovery. Cache and sync cursor now share one snapshot; encrypted pending sends survive offline reload, retry with backoff and converge by stable operation ID. Stale snapshots cannot restore deleted or older message revisions.
- A latest-page refresh could miss more than one page during disconnection. Added an authorized, bounded SQLite change stream, replayed on reconnect with reactions, receipts and hidden-message removals.
- SQLite write errors could be mistaken for success. Acknowledgements now follow durable insertion; unavailable persistence fails explicitly. Added a compound room/timestamp/ID index and stable tied-timestamp pagination.
- Failed migration batches could starve later records; exhausted failures disappeared from normal processing. Failed rows remain visible and retryable, and reconciliation advances through each batch once per run. Snapshot checks prevent acknowledging a concurrent edit as synchronized. Failed imports do not advance checkpoints.
- Notification failures and concurrent reminder execution could produce missing or duplicate work. Message storage is independent of notification success; notification recovery work is committed atomically in SQLite and drained in bounded pages. Transactional claims prevent duplicate notifications/reminders.
- Stale room access/list caches hid newly created direct messages or delayed membership changes. Membership authorization now consults current state; affected room caches are invalidated. SQLite also advances the sender’s unread watermark immediately, before the asynchronous PostgreSQL receipt commit.

## Data safety and synchronization

Before changes, the working tree patch and a consistent offline SQLite backup were preserved under `/private/tmp/tfhc-chat-refactor-baseline`. Tests use copies or the isolated localhost `tfhc_e2e` database. Existing application data was not reset. SQLite changes only add indexes, outbox/change tables and triggers.

The snapshot contains 25 messages; its largest conversation contains 10. Applying the additive schema to a disposable copy preserved every message column: SHA-256 before and after `698a4d830ac9930b08b0322423dad3db6aa0ce2eab1d8e8c61d391b986530a98` (ordered JSON objects).

The noon/midnight jobs retain original IDs and reconcile pending/failed writes with PostgreSQL. They report partial failures, preserve conflicts, retry subsequent runs and retain failed import checkpoints. Message edits/deletions are included; existing PostgreSQL receipt relationships remain authoritative. Sync does not block local rendering or sending.

## Measured results

The starting working tree was reconstructed in an isolated directory and built. Both versions used the same browser harness against localhost test services. These are small-sample local measurements, not production latency promises.

| Measurement | Starting version | Updated version |
| --- | ---: | ---: |
| Send click → optimistic paint, median (5 sends) | 13.30 ms | 12.30 ms |
| Send click → optimistic paint, p95 | 13.70 ms | 12.60 ms |
| Send click → recipient event, median | 4.60 ms | 18.50 ms |
| Send click → recipient event, p95 | 11.70 ms | 22.50 ms |
| Recipient events per logical message | 2 | 1 |
| Message-page API median (10 requests) | 2.60 ms | 3.94 ms |
| Message-page API p95 | 6.87 ms | 8.34 ms |
| Snapshot SQLite page p95 (500 samples) | 0.127 ms | 0.076 ms |

The recipient/API paths are **not faster in this run**. Durable outbox work is now required before transmission. Page samples contained different accumulated test-history lengths (1,673 versus 4,437 response bytes); those page timings are not a controlled payload comparison. The SQLite baseline is the previous raw query, while the updated measurement includes repository row mapping. Median SQLite time was 0.039 versus 0.062 ms. The snapshot had no inline attachments in its measured conversation, so no attachment payload reduction is claimed from it.

Reproduce storage measurements with `node scripts/benchmark-chat-storage.cjs /absolute/path/to/offline-backup.db`. Browser measurements use `playwright.chat-performance.config.ts`. Optional client timing events are enabled with `localStorage.setItem('tfhc:chat-performance', 'true')`.

## Verification

- Chat, SQLite multiprocess, migration and PWA unit suites: **56 passed** across six suites (Node 22).
- Additional final SQLite regression run: **12 passed**, including the new sender unread-watermark test (overlaps the six-suite run).
- Device cache/account isolation/idempotency/cursor tests: **5 passed**.
- Notification reliability database suite: **6 passed**, including concurrent reminders (the combined run with SQLite/migration tests had 26 passing tests).
- Chromium browser reliability: **3 passed**, including actual offline PWA reload and exactly-once recovery.
- Before and after browser benchmark harness: **1 passed per version**.
- Production web build: passed.
- Final data comparison: all 25 original message rows and columns equal the backup; original SHA-256 remains `c0de233bc449e02f5c242a2b18d42c41e6f0a822143bfe9ac4b5ca2162b72dad`.
- Production API build: passed.
- Final chat API/WebSocket integration: **17 passed** across two suites, covering authorization, direct/group messages, attachments, missed-message replay and ten concurrent senders. The final concurrent-send run measured p50 374 ms and p95/max 604 ms under host load; the separate five-send browser run above measured the UI path.

The integration run passed all assertions but Jest reported that a worker needed forced shutdown; test-process teardown remains a follow-up rather than a clean-exit claim.

The final Jest rerun used isolated TypeScript transpilation after a Node 26 verification run stalled; the API build independently checks TypeScript. Logs are retained in `/private/tmp/tfhc-chat-refactor-baseline`.

## Limits of the evidence

The changes have not been deployed to production. Local tests cannot prove zero future failures or WhatsApp-equivalent performance on every device/network. The available real SQLite snapshot is too small to establish production-scale scrolling or memory behavior. Large-history, slow-network media, production push delivery and full production sync-duration benchmarks remain unverified. Browser SQLite itself was not added. These limits must not be represented as a verified “100%” production completion.
