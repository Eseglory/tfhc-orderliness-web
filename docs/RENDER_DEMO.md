# Render Blueprint demo

Deploy the repository's `render.yaml` using Render → New → Blueprint after publishing the current changes to GitHub. It creates two paid Starter web services: the API and Next.js frontend. The existing Supabase database already contains the approved roster and service schedule; the Blueprint deliberately does not create an empty replacement database.

During setup, supply API `DATABASE_URL`, `SMTP_PASSWORD`, and `GOOGLE_OAUTH_CLIENT_IDS` from the local API environment. Supply web `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` from the local web environment. Never commit secret values. The API's JWT secret is generated automatically.

The expected public addresses are `https://tfhc-orderliness-api.onrender.com` and `https://tfhc-orderliness-web.onrender.com`. If Render assigns different names, set the API's `CORS_ORIGIN` to the actual frontend origin and the web's `NEXT_PUBLIC_API_URL` to the actual API origin, then rebuild the web service. Render passes environment values to declared Docker build arguments; public frontend values require a rebuild. Add the actual frontend origin to the Google OAuth web client's authorized JavaScript origins.

The API pre-deploy command applies Prisma migrations before startup. For Supabase transaction pool URLs on port 6543, it uses session pooling on 5432 for migrations. An optional `MIGRATION_DATABASE_URL` can override this connection. The migration command has been verified against the existing database.

Before the demo, check API `/health`, open web `/login`, and sign in using an approved Google email. In admin meeting management, create or select the real demo service with an attendance window covering the demo time and activate it. Attendance requires both an active meeting and an open time window.

At church, allow location access on the HTTPS site. The configured venue is latitude **6.6697906**, longitude **3.3581822**, radius **100 metres**. Open member check-in, select the active service, and submit. Confirm the record appears in the admin live monitor and member history. No camera or QR code is required. Browser tests use simulated coordinates; physical reception at the venue still needs this check.

Administrators can edit recurring sessions, Children's Church end times, arrival lead time, and reminder settings under Services. Reminders are configured for one hour before service to active approved members. Profile pictures are limited to 2 MB, email is immutable, and deactivation preserves account history.

Reference: [Render Blueprint specification](https://render.com/docs/blueprint-spec).
