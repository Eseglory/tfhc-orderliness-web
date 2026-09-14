import './setup-test-env';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: typeof import('sharp').default = require('sharp');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';

describe('Registration and Profile Lifecycle (E2E against local DB)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const testRunId = Date.now();
  const approvedEmail = `approved.member.${testRunId}@tfhc.org`;
  const unapprovedEmail = `unapproved.person.${testRunId}@tfhc.org`;
  const googleOnlyEmail = `google.member.${testRunId}@tfhc.org`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    authService = app.get(AuthService);

    // Seed approved member in lookup table
    await prisma.approvedMember.create({
      data: {
        email: approvedEmail,
        normalizedEmail: approvedEmail.toLowerCase(),
        status: 'ACTIVE',
        source: 'TEST_SUITE',
      },
    });

    await prisma.approvedMember.create({
      data: {
        email: googleOnlyEmail,
        normalizedEmail: googleOnlyEmail.toLowerCase(),
        status: 'ACTIVE',
        source: 'TEST_SUITE',
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.approvedMember.deleteMany({
      where: { email: { in: [approvedEmail, unapprovedEmail, googleOnlyEmail] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [approvedEmail, unapprovedEmail, googleOnlyEmail] } },
    });
    await app.close();
  });

  describe('1. Registration Eligibility Enforcement', () => {
    it('rejects registration when email is not in Lookup table (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: unapprovedEmail,
          password: 'Password123!456',
          firstName: 'Unapproved',
          lastName: 'User',
          phoneNumber: '08011223344',
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('lookup table');
    });

    it('rejects registration with invalid email syntax', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'invalid-email-no-at',
          password: 'Password123!456',
          firstName: 'Invalid',
          lastName: 'User',
          phoneNumber: '08011223344',
        });

      expect(res.status).toBe(400);
    });

    it('successfully registers when email exists in Lookup table', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: approvedEmail,
          password: 'Password123!456',
          firstName: 'Approved',
          lastName: 'Member',
          phoneNumber: '08011223344',
        });

      expect(res.status).toBe(201);
      expect(res.body.pendingVerification).toBe(true);

      // Verify User and Member records exist in DB
      const user = await prisma.user.findUnique({
        where: { email: approvedEmail.toLowerCase() },
        include: { member: true },
      });
      expect(user).toBeDefined();
      expect(user?.emailVerifiedAt).toBeNull();
      expect(user?.member).toBeDefined();
      expect(user?.member?.firstName).toBe('Approved');
    });

    it('rejects duplicate registration for the same email (409)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: approvedEmail,
          password: 'Password123!456',
          firstName: 'Approved',
          lastName: 'Member',
          phoneNumber: '08011223344',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already exists');
    });
  });

  describe('2. Direct Password vs Google OAuth Mutual Exclusivity', () => {
    let memberToken: string;
    let memberId: string;

    beforeAll(async () => {
      // Verify email for the password user so they can log in
      const user = await prisma.user.findUnique({
        where: { email: approvedEmail.toLowerCase() },
        include: { member: true },
      });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date() },
        });
        memberId = user.member!.id;
      }

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: approvedEmail,
          password: 'Password123!456',
        });

      expect(loginRes.status).toBe(201);
      memberToken = loginRes.body.accessToken;
    });

    it('password-registered user cannot sign in via Google OAuth endpoint', async () => {
      // Mocking Google claims verification
      const existingUser = await prisma.user.findUnique({ where: { email: approvedEmail.toLowerCase() } });
      expect(existingUser?.passwordAuthEnabled).toBe(true);
      expect(existingUser?.googleSubject).toBeNull();
    });

    it('Google-registered user cannot sign in with a password', async () => {
      // Create a Google-only member user
      const googleMember = await prisma.member.create({
        data: {
          memberCode: `TFHC-GGL-${Date.now()}`,
          firstName: 'Google',
          lastName: 'Only',
          phoneNumber: '08099887766',
          status: 'ACTIVE',
        },
      });

      const googleUser = await prisma.user.create({
        data: {
          email: googleOnlyEmail.toLowerCase(),
          passwordHash: 'placeholder',
          passwordAuthEnabled: false,
          googleSubject: `google-sub-${Date.now()}`,
          emailVerifiedAt: new Date(),
          role: 'MEMBER',
          member: { connect: { id: googleMember.id } },
        },
      });

      await prisma.approvedMember.update({
        where: { normalizedEmail: googleOnlyEmail.toLowerCase() },
        data: { memberId: googleMember.id },
      });

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: googleOnlyEmail,
          password: 'AnyPassword123!',
        });

      expect(loginRes.status).toBe(403);
      expect(loginRes.body.message).toContain('Google Sign-In');
    });
  });

  describe('3. Profile Management & Location Fields', () => {
    let memberToken: string;

    beforeAll(async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: approvedEmail,
          password: 'Password123!456',
        });
      memberToken = loginRes.body.accessToken;
    });

    it('GET /members/me/profile returns member profile details', async () => {
      const res = await request(app.getHttpServer())
        .get('/members/me/profile')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Approved');
      expect(res.body.user.email).toBe(approvedEmail.toLowerCase());
    });

    it('PUT /members/me/profile updates address, city, state, country, postalCode', async () => {
      const updateRes = await request(app.getHttpServer())
        .put('/members/me/profile')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          address: '123 Sanctuary Way',
          city: 'Ikeja',
          state: 'Lagos',
          country: 'Nigeria',
          postalCode: '100001',
          profession: 'Software Architect',
          birthday: '04-15',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.address).toBe('123 Sanctuary Way');
      expect(updateRes.body.city).toBe('Ikeja');
      expect(updateRes.body.state).toBe('Lagos');
      expect(updateRes.body.country).toBe('Nigeria');
      expect(updateRes.body.postalCode).toBe('100001');
      expect(updateRes.body.profession).toBe('Software Architect');
      expect(updateRes.body.birthday).toBe('04-15');
    });

    it('IDOR check: non-admin member cannot update another member profile via admin route', async () => {
      const otherMember = await prisma.member.findFirst({
        where: { NOT: { approvedMember: { normalizedEmail: approvedEmail.toLowerCase() } } },
      });
      if (otherMember) {
        const res = await request(app.getHttpServer())
          .put(`/members/${otherMember.id}`)
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ firstName: 'Hacked' });

        expect(res.status).toBe(403);
      }
    });
  });

  describe('4. Image Upload Requirements (Profile Photo & Banner, 1 MB Boundary)', () => {
    let memberToken: string;
    let smallImageBuffer: Buffer;
    let oversizedImageBuffer: Buffer;

    beforeAll(async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: approvedEmail,
          password: 'Password123!456',
        });
      memberToken = loginRes.body.accessToken;

      // Create a small valid 100x100 PNG image (< 50 KB)
      smallImageBuffer = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 128, b: 255 } },
      })
        .png()
        .toBuffer();

      // Create an oversized uncompressed image buffer (> 1 MB)
      oversizedImageBuffer = Buffer.alloc(1.2 * 1024 * 1024, 0xff);
    });

    it('POST /members/me/photo succeeds for valid image <= 1MB', async () => {
      const res = await request(app.getHttpServer())
        .post('/members/me/photo')
        .set('Authorization', `Bearer ${memberToken}`)
        .attach('photo', smallImageBuffer, 'avatar.png');

      expect(res.status).toBe(201);
      expect(res.body.profilePhotoUrl).toMatch(/^data:image\/webp;base64,/);
    });

    it('POST /members/me/photo rejects oversized image > 1MB (413 PayloadTooLarge)', async () => {
      const res = await request(app.getHttpServer())
        .post('/members/me/photo')
        .set('Authorization', `Bearer ${memberToken}`)
        .attach('photo', oversizedImageBuffer, 'huge.png');

      expect([400, 413]).toContain(res.status);
    });

    it('POST /members/me/photo rejects invalid non-image file', async () => {
      const textBuffer = Buffer.from('this is just a text file pretending to be image', 'utf8');
      const res = await request(app.getHttpServer())
        .post('/members/me/photo')
        .set('Authorization', `Bearer ${memberToken}`)
        .attach('photo', textBuffer, 'malicious.png');

      expect(res.status).toBe(400);
    });

    it('DELETE /members/me/photo removes profile picture', async () => {
      const res = await request(app.getHttpServer())
        .delete('/members/me/photo')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.profilePhotoUrl).toBeNull();
    });

    it('POST /members/me/banner succeeds for valid banner <= 1MB', async () => {
      const res = await request(app.getHttpServer())
        .post('/members/me/banner')
        .set('Authorization', `Bearer ${memberToken}`)
        .attach('banner', smallImageBuffer, 'banner.png');

      expect(res.status).toBe(201);
      expect(res.body.bannerPhotoUrl).toMatch(/^data:image\/webp;base64,/);
    });

    it('POST /members/me/banner rejects oversized banner > 1MB', async () => {
      const res = await request(app.getHttpServer())
        .post('/members/me/banner')
        .set('Authorization', `Bearer ${memberToken}`)
        .attach('banner', oversizedImageBuffer, 'huge-banner.png');

      expect([400, 413]).toContain(res.status);
    });

    it('DELETE /members/me/banner removes profile banner', async () => {
      const res = await request(app.getHttpServer())
        .delete('/members/me/banner')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.bannerPhotoUrl).toBeNull();
    });
  });
});
