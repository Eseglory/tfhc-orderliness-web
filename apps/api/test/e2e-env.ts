// Loaded before any e2e spec module (jest `setupFiles`). The per-route throttle
// limits in auth.controller / app.module are read at import time, so the flag
// that relaxes them for automated runs has to be set here, not in beforeAll.
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'test' : (process.env.NODE_ENV || 'test');
process.env.DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT || 'true';
