# Chat performance and reliability refactor

## Scope and architecture

Implemented in the existing chat module, without new dependencies or destructive migrations. The existing architecture uses **server-side SQLite**, PostgreSQL, Socket.IO, browser conversation caching and an encrypted IndexedDB outbox. This change retains that architecture; it does not introduce SQLite WASM into the browser. Cached conversations render locally while authorized background requests reconcile changes.

Flow: optimistic UI → durable encrypted device outbox → authenticated socket/HTTP → SQLite transaction → PostgreSQL message and notification-work commits → acknowledgement and recipient socket event. Notification delivery runs asynchronously. PostgreSQL is the durable authority because the existing free Render filesystem is ephemeral; SQLite remains the indexed hot store. Noon and midnight reconciliation remains enabled in Africa/Lagos time. No hosting upgrade was made.

## Root causes and changes

- The same recipient received both member-room and direct socket emissions. Removed the duplicate fanout; the browser benchmark changed from two events per message to one.
- Unbounded mounted history, eager media and repeated room/member/read requests added avoidable work. Added variable-height windowing, bounded cursor pages, debounced room refresh, lazy member loading and authenticated on-demand attachment retrieval. Legacy attachment responses remain available; compact media is opt-in.
- Device state needed durable, account-scoped recovery. Cache and sync cursor now share one snapshot; encrypted pending sends survive offline reload, retry with backoff and converge by stable operation ID. Stale snapshots cannot restore deleted or older message revisions.
- A latest-page refresh could miss more than one page during disconnection. Added an authorized, bounded SQLite change stream, replayed on reconnect with reactions, receipts and hidden-message removals.
- SQLite write errors could be mistaken for success. Acknowledgements now require SQLite insertion plus PostgreSQL confirmation and a durable notification-work record; unavailable persistence fails explicitly. Added a compound room/timestamp/ID index and stable tied-timestamp pagination.
- Failed migration batches could starve later records; exhausted failures disappeared from normal processing. Failed rows remain visible and retryable, and reconciliation advances through each batch once per run. Snapshot checks prevent acknowledging a concurrent edit as synchronized. Failed imports do not advance checkpoints.
- Notification failures and concurrent reminder execution could produce missing or duplicate work. Message storage is independent of notification success; notification recovery work is retained in SQLite and PostgreSQL and drained in bounded pages; PostgreSQL recovery survives rebuilding SQLite. Transactional claims prevent duplicate notifications/reminders.
- Stale room access/list caches hid newly created direct messages or delayed membership changes. Membership authorization now consults current state; affected room caches are invalidated. SQLite also advances the sender’s unread watermark immediately, before the asynchronous PostgreSQL receipt commit.

## Data safety and synchronization

Before changes, the working tree patch and a consistent offline SQLite backup were preserved under `/private/tmp/tfhc-chat-refactor-baseline`. Tests use copies or the isolated localhost `tfhc_e2e` database. Existing application data was not reset. SQLite changes only add indexes, outbox/change tables and triggers.

The snapshot contains 25 messages; its largest conversation contains 10. Applying the additive schema to a disposable copy preserved every message column: SHA-256 before and after `698a4d830ac9930b08b0322423dad3db6aa0ce2eab1d8e8c61d391b986530a98` (ordered JSON objects).

The noon/midnight jobs retain original IDs and reconcile pending/failed writes with PostgreSQL. They report partial failures, preserve conflicts, retry subsequent runs and retain failed import checkpoints. Message edits/deletions are included; existing PostgreSQL receipt relationships remain authoritative. Reconciliation does not block local rendering. Server acknowledgement waits for the durable primary commit; the device retains unacknowledged sends for retry. Midnight and manual reconciliation also audit older history, including historical records restored with their original timestamps. Change cursors include a database generation identifier so a rebuilt SQLite file cannot strand returning clients behind a cursor from its previous lifetime.

## Initial before/after measurements

The starting working tree was reconstructed in an isolated directory and built. Both versions used the same browser harness against localhost test services. These are small-sample local measurements from the initial refactor, before the final PostgreSQL-before-acknowledgement hardening, not production latency promises. Final-release measurements are recorded separately below.

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

## Final release verification — 24 September 2026

The release was assembled separately from concurrent attendance and wardrobe work. Both the API and production frontend build passed.

- SQLite, restart-cursor, multiprocess and migration regression suites: **30 tests passed** across three suites.
- Authenticated API/WebSocket and concurrency integration: **19 tests passed** across two suites, with clean process exit. Ten concurrent sends measured p50 **51 ms**, p95/max **61 ms** in the isolated localhost environment.
- Desktop Chromium and mobile Safari readiness checks: **7 tests passed**, covering long-history pagination/windowing, image retry after HTTP 503 with a delayed response, lazy voice playback, explicit document download, offline outbox recovery, offline PWA reload and exactly-once persistence.
- Earlier device-cache checks passed all five cases; earlier broader chat/PWA checks passed 56 tests. These overlap other runs and are not an additional final-release test count.

The load fixture used **10,000 generated records in the disposable localhost database**, not production messages. Both desktop and mobile initially fetched 30 records, loaded 12 earlier pages, and retained only nine mounted message rows. Desktop initial API page/open times were **40/360 ms**; mobile Safari measured **22/528 ms**. These are single-run environment-specific samples, not service-level guarantees or real-history measurements. Fixture rooms were removed after the checks.

The final five-send browser benchmark measured optimistic paint median/p95 **11.60/11.90 ms**, recipient delivery **20.80/41.30 ms**, and exactly one recipient event for each send. Ten page requests measured median/p95 **3.52/9.64 ms** with a 12,600-byte test-history payload. Different payload sizes and the added primary durability work preclude claiming a controlled API/recipient speedup over the initial baseline.

Attachment verification found and fixed eager document-as-image rendering, revoked object-URL reuse, and missing image retry feedback. Private media remains authenticated and voice/documents load on interaction.

## Production data and operational verification

The recovery audit is in `docs/chat-storage-audit.md`. Before release, authenticated live reads matched all 29 PostgreSQL message records across six rooms, including two test tombstones. There were zero pending, processing or failed SQLite writes. Anonymous room access returned 401. An authenticated WebSocket connected and reconnected after a forced transport interruption. This check created no production messages.

Pre-release warm production measurements from the operator's machine: health **665 ms**, room list **4,715 ms**, message-page median **1,433 ms**, socket ready **3,768 ms**, reconnection **2,922 ms**. These include network and authentication/database round trips and are not comparable to localhost results. A preceding Render cold start exceeded a 45-second health request timeout; the next request succeeded. The cached UI and queued sends reduce the effect, but cannot eliminate free-host cold starts.

The requested September 23 online-meeting attendance was independently verified for 20 unique members. Test cleanup and recovery preserved all original non-test PostgreSQL message fields and archived unmatched source records before removing them from active test storage.

## Remaining limits

No finite test suite guarantees zero future failures or identical performance on every network. Push-provider delivery to physical devices has not been claimed: notification persistence/recovery and application realtime delivery are tested. Existing free Render hosting can still sleep and cold-start. No paid upgrade was made, and acknowledged messages are committed to PostgreSQL before the client discards its durable queue.
