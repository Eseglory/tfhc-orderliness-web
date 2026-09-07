# TFHC Orderliness — Google OAuth client setup

This document records non-secret configuration values for TFHC Orderliness member sign-in. Do not add OAuth client secrets, API keys, or service-account files here.

> **Status:** the native Expo member app this document used to describe
> (Android/iOS OAuth clients, keystore SHA fingerprints) has been retired —
> see [MEMBER_MOBILE_MIGRATION.md](MEMBER_MOBILE_MIGRATION.md). Member
> sign-in is now a **web** OAuth 2.0 client used by
> [`GoogleSignInButton`](../apps/web/src/components/GoogleSignInButton.tsx)
> on the login page, via [Google Identity
> Services](https://developers.google.com/identity/gsi/web). The backend
> (`AuthService.loginMemberWithGoogle`) didn't need to change: it verifies
> any Google-issued ID token against `https://oauth2.googleapis.com/tokeninfo`
> and checks the token's `aud` claim against `GOOGLE_OAUTH_CLIENT_IDS` —
> it doesn't care which platform issued the token, only that a client ID it
> trusts is on the audience list. Prior Android/iOS client IDs, if any exist
> in that comma-separated list, can stay there harmlessly; this pass didn't
> remove them, since nothing here confirms whether they're still wanted.

## Create the Web OAuth 2.0 client

In the TFHC-owned Google Cloud project, under **APIs & Services → Credentials
→ Create Credentials → OAuth client ID**:

| Field | Value |
| --- | --- |
| Application type | Web application |
| Name | `TFHC Orderliness — Web` |
| Authorized JavaScript origins | The deployed web app's origin(s), e.g. `https://tfhc-orderliness-web.onrender.com`, plus `http://localhost:3000` for local development |
| Authorized redirect URIs | Not required — Google Identity Services' button flow uses a JS callback, not a redirect |

This is a "Web application" client, not "Android" or "iOS" — it needs no
package name, bundle ID, or SHA fingerprint. Unlike a client secret, a Web
OAuth client ID is meant to be public (it ships in the browser bundle); it's
still not something to guess or fabricate here — copy the exact value Google
Cloud Console shows after creating the client.

## Required configuration

| Location | Variable | Value |
| --- | --- | --- |
| `apps/web` build (Docker build arg, or `.env.local` for `next dev`) | `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` | The Web client ID above |
| `apps/api/.env` | `GOOGLE_OAUTH_CLIENT_IDS` | The same Web client ID (comma-separate additional client IDs if ever needed) |
| `render.yaml` | `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` (web service `dockerBuildArgs`) and `GOOGLE_OAUTH_CLIENT_IDS` (API service `envVars`, `sync: false`) | Same value, set in the Render dashboard after creating the client — not something to commit |
| Local `docker-compose.yml` | `GOOGLE_OAUTH_WEB_CLIENT_ID` (shell env var before `docker compose up`) | Same value; flows into both services, see the comments in `docker-compose.yml` |

Both `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_IDS` must
carry the *same* client ID — the frontend requests a token issued for that
audience, and the backend only accepts tokens whose audience is in its list.

Without `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` set, the login page shows "Member
Google sign-in is not configured for this deployment" instead of the button
— the rest of the app (including admin password login) still works.

## Verifying it end-to-end

This was implemented and its wiring verified (button renders when a client ID
is configured, submits the credential to `POST /auth/google/member`, handles
both success and error responses) but a **real successful sign-in** requires
an actual Google account and a real client ID — neither is available in an
automated environment, so that specific path is configured, not verified by
this repository's test suite. After setting the values above, sign in with a
Google account whose email is in this deployment's `approved_members` table
(status `ACTIVE`) and confirm it lands on `/member` with a working session.
