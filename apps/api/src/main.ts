import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();


import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // This is a pure JSON API consumed by a separately-hosted web
  // client, not an HTML-serving origin, so the default CSP (which assumes
  // same-origin HTML) is disabled; the other helmet headers still apply.
  app.use(helmet({ contentSecurityPolicy: false }));

  // The web client authenticates with a bearer token (no cookies), so
  // credentialed CORS is not needed; origin:'*' + credentials:true is an
  // invalid combination per the fetch spec and browsers reject it anyway.
  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: (reqOrigin, callback) => {
      if (corsOrigin && corsOrigin.length > 0) {
        if (!reqOrigin || corsOrigin.includes(reqOrigin)) {
          return callback(null, true);
        }
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Requested-With',
      'x-webhook-signature',
      'x-hub-signature-256',
      'x-goog-resource-state',
      'x-goog-channel-id',
      'X-Goog-Resource-State',
      'X-Goog-Channel-ID',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 TFHC Orderliness API running on port http://0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  console.error('BOOTSTRAP FATAL ERROR:', err);
  process.exit(1);
});
