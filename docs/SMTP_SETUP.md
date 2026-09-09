# System and admin SMTP

The API's shared `MailService` uses the configured sender for system jobs and administrator-triggered email workflows. SMTP is configured in the ignored `apps/api/.env`. The password is never committed. No emails are sent at startup, and existing notifications are not automatically emailed by this setup.

- Host: `mail.eglobalicthub.com`
- Port: `465` with implicit TLS and certificate verification
- Username/sender: `tfhc-orderliness@eglobalicthub.com`
- Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

Run `node scripts/verify-smtp.cjs` from the repository root to verify TLS and authentication without sending a message. System/admin workflows can inject `MailService` and call `sendEmail` with an explicit recipient, subject and body.

Render configuration declares the SMTP settings and marks `SMTP_PASSWORD` as a secret (`sync: false`). Set that secret on the API service and redeploy to activate the transport in production. The local workspace has no Render API credentials, so production environment settings were not updated.

Verified: live SMTP TLS authentication, three mocked mail-service tests, and API TypeScript checking. Inbox delivery has not been tested because no email was sent.
