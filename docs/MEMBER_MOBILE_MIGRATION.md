# Member Mobile Migration (retired 7 September 2026)

> **Status: superseded and removed.** The strategy below — member-only on
> mobile, admin-only on web — was superseded shortly after this document was
> written: `apps/web` was built out with full 1:1 Member routes alongside
> Admin, and now ships as an installable mobile-first PWA covering both. The
> product direction reverted to web-first, and `apps/member-mobile` has been
> removed from the working tree.
>
> Before removal, its functionality was audited against `apps/web` feature
> by feature. Everything matched except one real gap — weekly service
> availability (`GET`/`PUT /availability/current`) — which was ported to
> `apps/web` at `/member/availability` (linked from Profile → Settings) with
> new E2E coverage, before the mobile app was removed. The one thing
> intentionally *not* ported was Expo push-token registration
> (`POST /devices/push-token`): it only ever registered tokens, nothing in
> the backend ever sent a push through them, and Expo push tokens don't mean
> anything without an Expo client, so there was no working functionality
> there to preserve. That API module is now unused.
>
> The removed source is fully recoverable from git history:
> `git log --all -- apps/member-mobile`.

## Architecture boundary

The platform is being separated into three independently deployable clients/services:

- `apps/api`: authoritative NestJS API, domain services, jobs, and PostgreSQL persistence.
- `apps/web`: the existing Next.js Admin web client. Its Admin routes remain supported during the migration.
- `apps/member-mobile`: the Expo React Native Member client. It has no dependency on Next.js UI code and reaches the backend only through HTTP APIs.

The existing Member routes in `apps/web` are retained temporarily for backwards compatibility. New Member functionality must be added to the mobile application, not copied into the web client.

## Implemented mobile foundation

- Expo Router navigation and native bottom tabs.
- Secure token storage with `expo-secure-store`.
- Authenticated API client with consistent API errors.
- Member login, session restore, and logout.
- Dashboard (`/scoring/my-performance`), meetings (`/meetings`), and location-aware check-in (`/meetings/active`, `/attendance/check-in`).
- Foreground-only location permission flow. The app never starts background or continuous location tracking.
- Expo notification permission/token registration architecture.

## Backend changes

- Added authenticated `POST /devices/push-token` and `DELETE /devices/push-token` endpoints.
- Added the non-destructive `push_devices` table migration. Push tokens are associated with the authenticated user, not a client-provided user id.
- Existing Admin endpoints and data contracts are retained.

## Verification

- Prisma client generated successfully.
- API TypeScript build passes.
- Member mobile TypeScript check passes.
- Expo configuration validates for Android and iOS.
- Android JavaScript bundle export succeeds.
- Push-device migration is applied to the local development database.

## Next controlled phase

1. Add mobile screens for attendance history, leaderboard, excuses, corrections, rewards, and notifications using the existing APIs after contract review.
2. Add request DTO validation and versioned API compatibility strategy without breaking the Admin web client.
3. Add API authorization/integration tests, then device/location/notification tests using an Expo development build.
4. Configure EAS credentials and run Android/iOS native builds in the target release environment.
