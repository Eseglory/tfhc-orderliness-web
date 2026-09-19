import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Notifications, Push & Webhooks Integration (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Webhook Receivers', () => {
    it('GET /webhooks/health should return healthy status and available endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhooks/health')
        .expect(200);

      expect(res.body).toMatchObject({
        status: 'healthy',
        webhooksEnabled: true,
      });
      expect(Array.isArray(res.body.supportedEndpoints)).toBe(true);
    });

    it('POST /webhooks/google-calendar should accept push notifications from Google', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks/google-calendar')
        .set('x-goog-channel-id', 'test-channel-uuid-1234')
        .set('x-goog-resource-state', 'sync')
        .send({})
        .expect(200);

      expect(res.body).toMatchObject({
        received: true,
        provider: 'google-calendar',
        channelId: 'test-channel-uuid-1234',
        resourceState: 'sync',
      });
    });

    it('POST /calendar/integrations/google/webhook should maintain backwards compatibility', async () => {
      const res = await request(app.getHttpServer())
        .post('/calendar/integrations/google/webhook')
        .set('x-goog-channel-id', 'legacy-channel-5678')
        .set('x-goog-resource-state', 'exists')
        .send({})
        .expect(201);

      expect(res.body).toMatchObject({
        received: true,
        provider: 'google-calendar',
        channelId: 'legacy-channel-5678',
      });
    });

    it('POST /webhooks/inbound should process inbound webhook events', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send({
          event: 'TEST_EVENT',
          data: { test: true },
        })
        .expect(200);

      expect(res.body).toMatchObject({
        received: true,
        event: 'TEST_EVENT',
        status: 'PROCESSED',
      });
    });
  });

  describe('Push Configuration and Status', () => {
    it('GET /push/config requires authentication', async () => {
      await request(app.getHttpServer())
        .get('/push/config')
        .expect(401);
    });
  });
});
