import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(60000);

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
        webhooksEnabled: false,
      });
      expect(Array.isArray(res.body.supportedEndpoints)).toBe(true);
    });

    it('does not pretend an unconfigured Google watch was processed', async () => {
      await request(app.getHttpServer()).post('/webhooks/google-calendar').send({}).expect(503);
    });

    it('legacy Google webhook also reports unconfigured watches', async () => {
      await request(app.getHttpServer()).post('/calendar/integrations/google/webhook').send({}).expect(503);
    });

    it('rejects inbound events when no webhook secret is configured', async () => {
      await request(app.getHttpServer()).post('/webhooks/inbound')
        .send({ event: 'TEST_EVENT', data: { test: true } }).expect(503);
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
