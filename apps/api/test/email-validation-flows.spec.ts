import './setup-test-env';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../src/modules/mail/mail.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateEmail, normalizeEmail, isValidEmail } from '@tfhc/shared';
import { AuthController } from '../src/modules/auth/auth.controller';
import { JwtService } from '@nestjs/jwt';
import { RbacService } from '../src/common/rbac/rbac.service';
import { EmailOnlyDto, RegisterDto, LoginDto } from '../src/modules/auth/auth.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('Comprehensive Email Validation Across Application Flows', () => {
  let app: INestApplication;
  let mailService: MailService;
  let mockSendMail: jest.Mock;

  beforeAll(async () => {
    mockSendMail = jest.fn();
    const config = new ConfigService({
      SMTP_HOST: 'mail.tfhc.org',
      SMTP_PORT: '465',
      SMTP_USER: 'notifications@tfhc.org',
      SMTP_PASSWORD: 'secure_password',
      SMTP_FROM: 'TFHC Notifications <notifications@tfhc.org>',
      APP_WEB_URL: 'http://localhost:3000',
    });

    mailService = new MailService(config);
    // Directly spy on internal getTransport to control sendMail mock
    (mailService as any).transport = {
      sendMail: mockSendMail.mockResolvedValue({ accepted: ['valid@tfhc.org'], messageId: 'msg-test-123' }),
      verify: jest.fn().mockResolvedValue(true),
      close: jest.fn(),
    };
  });

  beforeEach(() => {
    mockSendMail.mockClear();
  });

  describe('1. Validation Unit Scenarios', () => {
    it('handles Valid Email', () => {
      const res = validateEmail('pastor.david@tfhc.org');
      expect(res.isValid).toBe(true);
      expect(res.normalizedEmail).toBe('pastor.david@tfhc.org');
    });

    it('rejects Invalid Syntax', () => {
      expect(validateEmail('invalid-syntax').isValid).toBe(false);
      expect(validateEmail('invalid@syntax..com').isValid).toBe(false);
      expect(validateEmail('invalid.@domain.com').isValid).toBe(false);
    });

    it('rejects Empty Email', () => {
      expect(validateEmail('').isValid).toBe(false);
      expect(validateEmail('   ').isValid).toBe(false);
      expect(validateEmail(null).isValid).toBe(false);
      expect(validateEmail(undefined).isValid).toBe(false);
    });

    it('rejects Missing Domain', () => {
      const res = validateEmail('user@');
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Missing domain');
    });

    it('rejects Missing @', () => {
      const res = validateEmail('userdomain.com');
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Missing @');
    });

    it('rejects Invalid Domain', () => {
      expect(validateEmail('user@domain').isValid).toBe(false);
      expect(validateEmail('user@domain.c').isValid).toBe(false);
      expect(validateEmail('user@-domain.com').isValid).toBe(false);
    });

    it('rejects Placeholder / Example Domains (example.com, sample.com, test.com)', () => {
      const placeholders = [
        'sam@example.com',
        'test@example.org',
        'user@example.net',
        'john@sample.com',
        'foo@bar.com',
        'user@test.com',
        'dummy@dummy.com',
        'fake@fakemail.com',
      ];
      for (const email of placeholders) {
        const res = validateEmail(email);
        expect(res.isValid).toBe(false);
        expect(res.isExampleOrTest).toBe(true);
      }
    });

    it('rejects Obvious Test / Fake Addresses (mailinator, tempmail, trashmail)', () => {
      const disposable = [
        'throwaway@mailinator.com',
        'temp@tempmail.com',
        'fake@10minutemail.com',
        'test@yopmail.com',
      ];
      for (const email of disposable) {
        const res = validateEmail(email);
        expect(res.isValid).toBe(false);
      }
    });

    it('handles Uppercase Email Normalization', () => {
      const res = validateEmail('DEACON.SAMUEL@TFHC.ORG');
      expect(res.isValid).toBe(true);
      expect(res.normalizedEmail).toBe('deacon.samuel@tfhc.org');
    });

    it('handles Whitespace Around Email', () => {
      const res = validateEmail('   sister.mary@tfhc.org   \t');
      expect(res.isValid).toBe(true);
      expect(res.normalizedEmail).toBe('sister.mary@tfhc.org');
    });
  });

  describe('2. DTO Validation Boundaries (API Input Safeguards)', () => {
    it('EmailOnlyDto rejects example.com and invalid syntax', async () => {
      const invalidInstance = plainToInstance(EmailOnlyDto, { email: 'sam@example.com' });
      const errors = await validate(invalidInstance);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isDeliverableEmail).toBeDefined();

      const validInstance = plainToInstance(EmailOnlyDto, { email: 'sam@tfhc.org' });
      const validErrors = await validate(validInstance);
      expect(validErrors.length).toBe(0);
    });

    it('LoginDto rejects placeholder emails', async () => {
      const invalid = plainToInstance(LoginDto, { email: 'user@sample.com', password: 'Password12345!' });
      const errors = await validate(invalid);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isDeliverableEmail).toBeDefined();
    });

    it('RegisterDto rejects invalid and placeholder domains', async () => {
      const invalid = plainToInstance(RegisterDto, {
        email: 'newmember@example.org',
        password: 'ValidPassword123!',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '08012345678',
      });
      const errors = await validate(invalid);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints?.isDeliverableEmail).toBeDefined();
    });
  });

  describe('3. Dispatch Boundary Safeguard (MailService Protection)', () => {
    it('MailService.sendEmail dispatches to valid normalized address', async () => {
      mockSendMail.mockResolvedValueOnce({ accepted: ['pastor@tfhc.org'], messageId: 'ok-123' });
      const result = await mailService.sendEmail({
        to: '  Pastor@TFHC.ORG  ',
        subject: 'Service Brief',
        text: 'Hello Pastor',
      });
      expect(result.messageId).toBe('ok-123');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'pastor@tfhc.org',
          subject: 'Service Brief',
        }),
      );
    });

    it('MailService.sendEmail BLOCKS placeholder addresses and does NOT call transport', async () => {
      const invalidAddresses = [
        'sam@example.com',
        'john@sample.com',
        'foo@bar.com',
        'test@test.com',
        'user@mailinator.com',
        'not-an-email',
      ];

      for (const to of invalidAddresses) {
        await expect(
          mailService.sendEmail({ to, subject: 'Alert', text: 'Body' }),
        ).rejects.toThrow(/Invalid or undeliverable email recipient/);
      }

      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });
});
