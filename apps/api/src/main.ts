import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // This is a pure JSON API consumed by a separately-hosted web
  // client, not an HTML-serving origin, so the default CSP (which assumes
  // same-origin HTML) is disabled; the other helmet headers still apply.
  app.use(helmet({ contentSecurityPolicy: false }));

  // The web client authenticates with a bearer token (no cookies), so
  // credentialed CORS is not needed; origin:'*' + credentials:true is an
  // invalid combination per the fetch spec and browsers reject it anyway.
  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : '*',
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

bootstrap();
