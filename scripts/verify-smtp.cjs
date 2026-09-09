// Checks TLS and SMTP authentication only. Does not send an email.
const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../apps/api/package.json'));
req('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
req('ts-node').register({ project: path.resolve(__dirname, '../apps/api/tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { ConfigService } = req('@nestjs/config');
const { MailService } = require('../apps/api/src/modules/mail/mail.service.ts');
const mail = new MailService(new ConfigService());
mail.verifyConnection().then(() => console.log('SMTP TLS connection and authentication verified. No email sent.'))
  .catch(() => { console.error('SMTP verification failed. Check server reachability, TLS certificate and credentials.'); process.exitCode = 1; })
  .finally(() => mail.onModuleDestroy());
