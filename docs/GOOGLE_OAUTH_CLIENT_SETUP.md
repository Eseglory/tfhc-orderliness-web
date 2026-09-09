# TFHC Orderliness — Google OAuth client setup

This document records non-secret configuration values for TFHC Orderliness member sign-in. Do not add OAuth client secrets, API keys, or service-account files here.

The product is a web PWA only. Native OAuth credentials and audiences have been removed. A Google OAuth **Web application** client is required for the browser button. The backend verifies the signed token audience against `GOOGLE_OAUTH_CLIENT_IDS` and requires an active approved member record.

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

Without `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` set — or left at the
`REPLACE_WITH_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com` placeholder the
example files ship with — the login page shows "Member Google sign-in is not
configured for this deployment" instead of the button, and the API returns
`503 GOOGLE_AUTH_NOT_CONFIGURED` for `POST /auth/google/member`. The rest of the
app (including admin password login) still works. Any value beginning with
`REPLACE_` is ignored on both sides; replace it with the exact client ID from
Google Cloud Console.

## Verifying it end-to-end

This was implemented and its wiring verified (button renders when a client ID
is configured, submits the credential to `POST /auth/google/member`, handles
both success and error responses) but a **real successful sign-in** requires
an actual Google account and a real client ID — neither is available in an
automated environment, so that specific path is configured, not verified by
this repository's test suite. After setting the values above, sign in with a
Google account whose email is in this deployment's `approved_members` table
(status `ACTIVE`) and confirm it lands on `/member` with a working session.
