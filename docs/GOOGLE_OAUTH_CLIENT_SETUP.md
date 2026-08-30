# TFHC Orderliness — Google OAuth client setup

This document records non-secret configuration values for the TFHC Orderliness Member app. Do not add OAuth client secrets, API keys, private keystores, passwords, or service-account files here.

## Application identifiers

| Platform | Value |
| --- | --- |
| Expo application name | `TFHC Orderliness` |
| Expo slug | `tfhc-orderliness-member` |
| Expo URL scheme | `tfhc-orderliness` |
| Android package name | `org.tfhc.orderliness.member` |
| iOS bundle identifier | `org.tfhc.orderliness.member` |

## Android development OAuth client

Create this client in the TFHC-owned Google Cloud project:

| Field | Value |
| --- | --- |
| Application type | Android |
| Client name | `TFHC Orderliness — Android Development` |
| Package name | `org.tfhc.orderliness.member` |
| SHA-1 | `10:10:B7:02:A6:AC:99:C0:FF:2D:8D:10:83:47:E8:54:FE:E3:F4:ED` |
| SHA-256 | `A4:4A:76:21:C1:86:E5:B3:5A:56:61:95:71:4C:31:38:CE:3C:4D:B0:F5:0B:35:BB:91:1B:D5:4B:4B:CE:A0:AA` |

These fingerprints identify the local TFHC development signing certificate. The keystore is intentionally excluded from Git and its password is stored only in the local macOS Keychain.

Create a separate production Android OAuth client after production signing is configured. Use the SHA-1 from EAS production credentials or Google Play Console App Signing—not the development fingerprint above.

### Retrieve the correct Android fingerprint

For the local TFHC development keystore, run:

```sh
keytool -keystore apps/member-mobile/credentials/tfhc-orderliness-development.keystore -list -v
```

The keystore password is stored in the local macOS Keychain and must not be committed or written to this document.

For Google Play distribution, use the **App signing key certificate** fingerprint in Google Play Console:

```text
Protected with Play → Play Store protection → Manage Play app signing
```

That Play App Signing SHA-1 is the value for the separate Android Production OAuth client. Do not replace the development OAuth client fingerprint with it; both clients may be needed.

## iOS OAuth client

| Field | Value |
| --- | --- |
| Application type | iOS |
| Client name | `TFHC Orderliness — iOS` |
| Bundle ID | `org.tfhc.orderliness.member` |
| App URL scheme | `tfhc-orderliness` |

The Apple Team ID and App Store ID are not yet available because the application has not been registered in the TFHC Apple Developer account.

## After client creation

Store generated client IDs only in the relevant environment configuration:

```text
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<generated Android client ID>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<generated iOS client ID>
GOOGLE_OAUTH_CLIENT_IDS=<Android client ID>,<iOS client ID>
```

The first two variables belong in the Expo/EAS build environment. `GOOGLE_OAUTH_CLIENT_IDS` belongs only on the TFHC API server. OAuth client secrets are not used by the current native ID-token flow and must not be added to the mobile app.

## Required configuration checklist

| Location | Required setting | Value to enter |
| --- | --- | --- |
| `apps/member-mobile/.env` | `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Generated Android OAuth client ID |
| `apps/member-mobile/.env` | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Generated iOS OAuth client ID |
| `apps/member-mobile/.env` | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Leave blank for the current native-only app |
| `apps/api/.env` | `GOOGLE_OAUTH_CLIENT_IDS` | Android client ID, comma, iOS client ID |
| `apps/member-mobile/app.json` | `android.package` | `org.tfhc.orderliness.member` — already configured |
| `apps/member-mobile/app.json` | `ios.bundleIdentifier` | `org.tfhc.orderliness.member` — already configured |

The downloaded iOS `.plist` and Google `client_secret_*.json` files are **not runtime configuration files for this Expo AuthSession implementation**. Keep them out of source control. Do not copy a client secret into any `.env` file.
