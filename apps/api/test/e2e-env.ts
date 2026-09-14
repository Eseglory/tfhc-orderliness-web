import './setup-test-env';

// Loaded before any e2e spec module (jest `setupFiles`). The per-route throttle
// limits in auth.controller / app.module are read at import time, so the flag
// that relaxes them for automated runs has to be set here, not in beforeAll.
process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.DISABLE_SCHEDULED_JOBS = 'true';
process.env.JWT_SECRET = 'e2e-local-only-secret';
for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) process.env[key] = '';

