import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  isValidEmail,
  normalizeEmail,
  assertValidDeliverableEmail,
} from '../email-validation';

describe('Email Validation & Normalization', () => {
  describe('Normalization', () => {
    it('trims whitespace and lowercases uppercase emails', () => {
      expect(normalizeEmail('  John.Doe@Example.COM  ')).toBe('john.doe@example.com');
      expect(normalizeEmail('User@Domain.org')).toBe('user@domain.org');
    });

    it('strips angle brackets if present', () => {
      expect(normalizeEmail('<member@tfhc.org>')).toBe('member@tfhc.org');
    });

    it('handles non-string values safely', () => {
      expect(normalizeEmail(null)).toBe('');
      expect(normalizeEmail(undefined)).toBe('');
      expect(normalizeEmail(123)).toBe('');
    });
  });

  describe('Valid Emails', () => {
    const validEmails = [
      'user@tfhc.org',
      'glory.eseosa@gmail.com',
      'admin_account+123@yahoo.co.uk',
      'pastor.david@tfhc-lagos.org',
      'member123@subdomain.company.ng',
      'first.last-name@my-domain.org',
    ];

    validEmails.forEach((email) => {
      it(`accepts valid email: ${email}`, () => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(true);
        expect(result.normalizedEmail).toBe(email.toLowerCase());
        expect(isValidEmail(email)).toBe(true);
        expect(() => assertValidDeliverableEmail(email)).not.toThrow();
      });
    });
  });

  describe('Invalid Syntax', () => {
    const invalidSyntax = [
      { input: '', reason: 'Empty email' },
      { input: '   ', reason: 'Whitespace-only email' },
      { input: 'notanemail', reason: 'Missing @' },
      { input: 'user@', reason: 'Missing domain' },
      { input: '@domain.com', reason: 'Missing local part' },
      { input: 'user@domain@another.com', reason: 'Multiple @' },
      { input: 'user..name@domain.com', reason: 'Consecutive dots in local part' },
      { input: '.username@domain.com', reason: 'Leading dot in local part' },
      { input: 'username.@domain.com', reason: 'Trailing dot in local part' },
      { input: 'user@domain..com', reason: 'Consecutive dots in domain' },
      { input: 'user@-domain.com', reason: 'Leading hyphen in domain' },
      { input: 'user@domain-.com', reason: 'Trailing hyphen in domain' },
      { input: 'user@domain.c', reason: 'Single character TLD' },
      { input: 'user@domain.123', reason: 'Numeric TLD' },
      { input: 'user name@domain.com', reason: 'Space in local part' },
      { input: 'user@dom ain.com', reason: 'Space in domain part' },
      { input: 'user\n@domain.com', reason: 'Newline in email' },
      { input: 'user\r\n@domain.com', reason: 'CRLF header injection' },
    ];

    invalidSyntax.forEach(({ input, reason }) => {
      it(`rejects invalid syntax (${reason}): "${input}"`, () => {
        const result = validateEmail(input);
        expect(result.isValid).toBe(false);
        expect(isValidEmail(input)).toBe(false);
        expect(() => assertValidDeliverableEmail(input)).toThrow();
      });
    });
  });

  describe('Placeholder, Example & Reserved Domains', () => {
    const placeholderEmails = [
      'sam@example.com',
      'test@example.com',
      'user@example.org',
      'admin@example.net',
      'john@sample.com',
      'foo@bar.com',
      'admin@test.com',
      'dummy@dummy.com',
      'fake@fakemail.com',
      'user@mailinator.com',
      'temp@tempmail.com',
      'test@throwawaymail.com',
      'member@localhost',
      'admin@site.test',
      'user@site.invalid',
      'foo@site.example',
    ];

    placeholderEmails.forEach((email) => {
      it(`rejects placeholder / example email: ${email}`, () => {
        const result = validateEmail(email);
        expect(result.isValid).toBe(false);
        expect(isValidEmail(email)).toBe(false);
        expect(() => assertValidDeliverableEmail(email)).toThrow(/EMAIL_VALIDATION_ERROR/);
      });
    });

    it('allows test domains when explicitly configured for mock-only testing', () => {
      const result = validateEmail('admin@example.com', { allowTestDomains: true });
      expect(result.isValid).toBe(true);
    });
  });
});
