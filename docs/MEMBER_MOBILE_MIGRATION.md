# Web PWA migration

Completed 8 September 2026. `apps/web` is the only member/admin client. The native app directory, native OAuth downloads/audiences, Expo push API module, and push-device database model have been removed. Historical SQL migrations remain so existing databases can upgrade; the latest migration removes the retired table.

The PWA includes availability, meeting check-in, attendance, profile, analytics, leaderboard, excuses/corrections, and in-app notifications. It uses browser camera/geolocation APIs and a Web application Google OAuth client. No native OAuth client IDs should be configured. Browser push notifications are not implemented.
