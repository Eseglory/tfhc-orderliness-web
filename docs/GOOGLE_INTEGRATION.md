# Google integration — TFHC Orderliness

## Implemented boundary

The Expo Member app uses `expo-auth-session` with Google ID-token flow. It sends only the resulting ID token to `POST /auth/google/member`. The API verifies the token with Google's token-info endpoint, requires a valid Google issuer, unexpired token, verified email, non-empty subject, and an audience in `GOOGLE_OAUTH_CLIENT_IDS`. It then normalizes the verified email and performs the server-side Approved Member lookup before linking the Google subject to the existing TFHC Member and issuing the TFHC JWT.

The app never uses a Google token as its TFHC session. The TFHC JWT is held in `expo-secure-store` on native devices.

## Required configuration

Create OAuth client IDs in the TFHC-owned Google Cloud project:

1. Android OAuth client using application ID `org.tfhc.orderliness.member` and the relevant release/development SHA-1/SHA-256 signing fingerprints.
2. iOS OAuth client using bundle identifier `com.eglobalicthub.tfhcorderliness` and configured redirect URL scheme `tfhc-orderliness`.
3. Web OAuth client only if the web redirect flow is enabled.
4. Put the three public client IDs into the corresponding `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` values supplied to EAS build environments.
5. Set `GOOGLE_OAUTH_CLIENT_IDS` on the API as a comma-separated allowlist of every mobile client ID which may mint a TFHC identity token. The older singular `GOOGLE_OAUTH_CLIENT_ID` remains a compatibility fallback.

Client IDs are public identifiers. Do not put OAuth client secrets, service-account files, API keys, or production JWT secrets in Expo public variables or Git.

## Google APIs and location

TFHC currently requires foreground device GPS only at check-in. The application uses `expo-location` and server-side geofence distance calculation; it does not use Google Maps, Places, Geocoding, or a Maps API key. Do not enable Maps Platform APIs or billing for this implementation unless a later TFHC requirement adds an actual map/places feature.

The mobile configuration requests only iOS foreground location (`NSLocationWhenInUseUsageDescription`). Background/continuous tracking is intentionally not requested.

## Release validation

Use an EAS development build—not an inference from Expo Go—to validate Android and iOS. Verify both an approved and unapproved Google account, then confirm the token audience emitted on each platform is present in `GOOGLE_OAUTH_CLIENT_IDS`. Keep EAS/Google/Apple credentials in their managed secret stores and never commit them.
