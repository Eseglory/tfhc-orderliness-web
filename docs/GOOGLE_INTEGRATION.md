# Google sign-in for the web PWA

The only client is `apps/web`. It uses the Google Identity Services browser button and posts its ID token to `POST /auth/google/member`. The backend verifies issuer, audience, expiry, verified email, and subject. Only an active approved member can receive an application session. First-time account linking is transactional; revocation invalidates existing Google-linked sessions.

Use a Google OAuth client of type **Web application**. Configure authorized JavaScript origins for the production site and local development. The supplied native OAuth clients have been removed and cannot substitute for a Web client.

After downloading the Web client configuration from Google Cloud, run:

```sh
node scripts/configure-web-oauth.cjs /path/to/web-client.json
```

This copies only the public client ID into the API and web environment files. It rejects installed/native client configurations and does not copy client secrets. Rebuild the frontend after changing its public environment variables.

The admin directory supports creating a member with an approved Google email, and a **Google access** control for approving/revoking existing members. Only administrators may grant this access. Account emails cannot be reassigned through this control after linking.

The PWA uses browser geolocation and camera APIs for QR check-in. Google Maps/Places APIs are not required. Session persistence follows the login page's Remember Me selection; logout clears both persistent and session storage.

Automated tests cover Google provider-response verification, transactional linking, revocation, and browser callback wiring. A successful real Google account sign-in requires a valid Web client and an approved real member account.

See [GOOGLE_OAUTH_CLIENT_SETUP.md](GOOGLE_OAUTH_CLIENT_SETUP.md) for console settings.
