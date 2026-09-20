# Communication reliability work — 20 September 2026

This is an implementation and verification record, not a declaration that the full requested overhaul is complete. Production verification is recorded separately below as it happens.

## Findings and architecture

- Render API: one Free instance in Oregon, ephemeral filesystem, no shared SQLite volume. PostgreSQL is the authoritative message store. A successful send now requires its database commit; SQLite is a rebuildable cache and legacy recovery queue. JSON and process memory are not message stores.
- Deployment logs showed Supabase session-pool exhaustion. The staged Render connection limit is three per process. The original limit was ten; multiple local development processes also connected to production and have been stopped.
- SQLite uses WAL, prepared statements, busy timeout and FULL synchronous writes. A local write alone is insufficient on the current Render topology.
- Direct/custom room listing excluded NULL room keys through SQL `NOT IN`. The query now explicitly includes those rooms.
- History uses bounded PostgreSQL cursor pagination, without merging SQLite rows into pages. This prevents oversized pages, resurrected records and inconsistent cursors.
- Socket.IO has a shared client connection across navigation and chat. Current membership is checked before fan-out. Text retry uses the same client operation ID over sockets and HTTP.
- Messages and recipient notifications commit together. Unique delivery claims prevent repeated notification creation. Push uses the persistent notification dispatcher; provider acceptance is not proof of device display.
- Offline text is encrypted with an account-specific non-extractable device key in IndexedDB before optimistic display. Successful server acknowledgement removes the queued record. Foreground reconnect retries it. This does not promise permanent browser storage or closed-app background text sending.
- Authentication rechecks password/session revocation against the database; the route guard reacts to failed initial authentication even when no user was previously loaded.
- Reactions, per-member hidden messages and delivered/read watermarks are stored in PostgreSQL. Read updates cannot clear alerts for newer messages. Typing expires in five seconds and is not persisted.
- Noon and midnight reconciliation remains in Africa/Lagos unless configured otherwise. Imports are paginated with a saved checkpoint and overlap, include edits/deletions, and preserve unsynchronized local records. Primary content wins conflicts; stale local content cannot overwrite it. Sync status and manual reconciliation require `messages.manage_rooms` at `/chat/sync/status` and `/chat/sync/reconcile`.

## Reminders and integrations

The reminder dispatcher selects the latest due 24-hour, 12-hour or 1-hour window and checks availability, member status and visibility. Notification claims and records commit atomically. Restricted events are not posted to General. Scheduled notifications and active attendance reminders have dismissible member popups.

Webhook notification dispatch validates HMAC against raw request bytes, rejects missing configuration, validates its target, and atomically records the receipt and effect. Google Calendar provider watch registration is not implemented; its callback explicitly returns unavailable instead of pretending to process events.

SMTP retries are bounded to failures known to occur before acceptance or explicit temporary rejections. Ambiguous post-DATA failures are not blindly retried. Email acceptance is logged as acceptance, not inbox delivery. Scheduler email claims that fail or remain ambiguous require review; exactly-once external SMTP delivery is not guaranteed.

## Verification evidence

Logs are retained under the ignored `.validation/notification-repair/` directory.

- API regression: 36 suites passed, one skipped; 275 tests passed, one skipped. The final run used a 4 GB heap with a recyclable single Jest worker after accumulated test-runner memory exhausted earlier runs.
- Chat integration/concurrency: 14 tests passed in the combined run; the subsequent chat suite passed all 13 tests including forwarding. Includes ten concurrent users, five direct conversations, real Socket.IO delivery, retry idempotency, reactions, hiding, search, receipts and room authorization.
- Local concurrent-send sample: ten simultaneous requests, median 204 ms, observed 95th-percentile/max 210 ms. Includes HTTP acknowledgement and notification fan-out. This small local sample is not a production capacity result or a before/after speed claim.
- Production pre-deployment health probes: first request timed out at 45,005 ms; subsequent requests returned HTTP 200 in 7,570 ms and 1,133 ms. These are health/network observations, not chat latency measurements; they demonstrate a cold-start availability problem on the current tier.
- Chromium offline recovery: passed; durable queue survived reload, reconciled to one visible message and one PostgreSQL record.
- Sync unit/integration tests: six passed, including retained failed records and duplicate handling. These use real SQLite and mocked primary operations, not a production replication benchmark.
- Frontend and backend builds pass. The complete 18-test Chromium reminder/PWA/auth/chat regression passed. The final two-test queue handoff/reminder run also passed after the last composer change.
- Additive schema change only: delivery watermark, reaction table and per-member hidden-message table. RLS enabled for the new backend-only tables. No message deletion/backfill.
- A protected complete production archive was created before deployment. The application schema restored successfully to an isolated local database: 10 messages, six rooms, 24 members; that temporary database was then removed. Startup now fails if schema deployment fails instead of launching against an incompatible database.

## Infrastructure and remaining acceptance work

- Render Free sleeps and blocks outbound SMTP ports 25, 465 and 587. Existing SMTP uses 465. Always-on scheduled work and the configured email transport need paid compute; no billing upgrade has been made without approval. [Render Free limits](https://render.com/docs/free), [SMTP restriction](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports), [compute pricing](https://render.com/pricing).
- No registered production push subscription existed at the audit. An actual Glory device must opt in before push display/click can be verified.
- Large media remains limited to the existing 2 MB resumable attachment path. Raising this cap without authenticated object storage and streaming would increase database payloads and memory pressure. Reliable large-video storage, media caching/eviction and thumbnails are not complete.
- No TURN or SFU has been configured or purchased. Production voice/video and group calling are not implemented. WebRTC direct calls need TURN for networks where peers cannot connect; group calls should use an SFU, with application-authorized room tokens and an explicit bandwidth budget. [WebRTC TURN guidance](https://webrtc.org/getting-started/turn-server), [LiveKit SFU](https://docs.livekit.io/reference/internals/livekit-sfu/).
- Presence is connection-based. Persisted last-seen and full group receipt counts in live updates remain incomplete.
- Multiple API instances would require a cross-instance socket adapter and shared ephemeral presence/typing state. The current deployment is single-instance; PostgreSQL durability alone does not distribute live events.
- Comprehensive production latency comparisons, media/call tests, closed-app push proof and the full Glory acceptance checklist remain required. No claim of 100% completion is made.

## Production rollout evidence

Release `42950f7` reached Render live as `dep-danrmvgae00c739r2s80`; Vercel production deployment `dpl_66LvSZykQjUUz9n2fjax1pywreRb` is READY at the existing domain. An earlier attempt correctly stopped on a previously failed headcount migration. Its full schema, and the following supervising-minister schema, already existed. Columns, nullability, indexes and foreign keys were inspected before resolving those two migration records as applied. The additive chat migration then applied successfully.

At 2026-09-20 10:58 UTC, production verification through Glory's actual login showed:

- Authenticated Socket.IO connection and receipt of the labelled General verification message.
- One message despite two submissions using the same client ID.
- Signed webhook results `PROCESSED` then `ALREADY_PROCESSED`, with exactly one notification for Glory.
- All ten original message IDs preserved; PostgreSQL and rebuilt SQLite both contained eleven messages after reconciliation, with zero sync failures.
- No registered push device for Glory, so device display and click-through remain unverified.
- HTTP send acknowledgement took 7,132 ms. This is too slow for the requested target. The socket receipt timestamp was overwritten by the retry in this first probe and is not a valid first-delivery latency measurement.
- Frontend login, service worker, API health and webhook health returned HTTP 200. API health took 588 ms in that warm probe. Webhook signing and VAPID configuration were enabled.

The follow-up removes receipt/reaction joins that cannot yet contain recipient acknowledgements for a new message, and skips redundant notification transactions when the primary send transaction already committed them. A non-serialized marker is only a performance hint; messages and notifications remain durable in PostgreSQL. General service posts no longer create a second notification broadcast outside the availability-filtered reminder dispatcher. Send persistence and fan-out durations are logged without message content.
