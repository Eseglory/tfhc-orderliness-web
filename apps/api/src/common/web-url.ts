import { ConfigService } from '@nestjs/config';

/**
 * Base URL of the web app, used to build links in transactional emails
 * (invites, email verification, password reset). Prefers an explicit
 * `APP_WEB_URL`, falls back to the first `CORS_ORIGIN`, then localhost.
 */
export function webBaseUrl(config: ConfigService): string {
  const configured =
    config.get<string>('APP_WEB_URL') ||
    (config.get<string>('CORS_ORIGIN') || '').split(',')[0].trim();
  return (configured || 'http://localhost:3000').replace(/\/+$/, '');
}
