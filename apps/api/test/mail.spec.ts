import { ConfigService } from '@nestjs/config';
import { MailService } from '../src/modules/mail/mail.service';
import * as nodemailer from 'nodemailer';
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('SMTP mail service', () => {
  const verify = jest.fn();
  const sendMail = jest.fn();
  const close = jest.fn();
  const config = new ConfigService({
    SMTP_HOST: 'mail.tfhc.org',
    SMTP_PORT: '465',
    SMTP_USER: 'notifications@tfhc.org',
    SMTP_PASSWORD: 'test-secret',
    SMTP_FROM: 'TFHC Orderliness <notifications@tfhc.org>',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ verify, sendMail, close });
  });

  it('verifies authenticated TLS without sending a message', async () => {
    verify.mockResolvedValue(true);
    const mail = new MailService(config);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    await expect(mail.verifyConnection()).resolves.toEqual({ connected: true });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 465,
        secure: true,
        requireTLS: true,
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    expect(sendMail).not.toHaveBeenCalled();
    mail.onModuleDestroy();
    expect(close).toHaveBeenCalled();
  });

  it('normalizes recipient email and sends using configured sender for valid address', async () => {
    sendMail.mockResolvedValue({ messageId: 'test-msg-id-123', accepted: ['member@tfhc.org'] });
    const mail = new MailService(config);
    await expect(
      mail.sendEmail({ to: '  Member.John@TFHC.ORG  ', subject: 'Notice', text: 'Test content' }),
    ).resolves.toEqual({ messageId: 'test-msg-id-123' });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'TFHC Orderliness <notifications@tfhc.org>',
        to: 'member.john@tfhc.org',
        subject: 'Notice',
        text: 'Test content',
      }),
    );
  });

  it('rejects sending to placeholder / example domains (e.g. example.com, sample.com)', async () => {
    const mail = new MailService(config);
    const placeholderRecipients = [
      'sam@example.com',
      'test@example.org',
      'user@sample.com',
      'john@test.com',
      'foo@bar.com',
      'fake@fakemail.com',
      'user@mailinator.com',
      'user@tempmail.com',
    ];

    for (const to of placeholderRecipients) {
      await expect(mail.sendEmail({ to, subject: 'Notice', text: 'Test' })).rejects.toThrow(
        /Invalid or undeliverable email recipient/,
      );
    }
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rejects sending to syntactically invalid, empty, or header-injected addresses', async () => {
    const mail = new MailService(config);
    const invalidRecipients = [
      '',
      '   ',
      'not-an-email',
      '@domain.com',
      'user@',
      'user@domain',
      'user@domain..com',
      'user\r\n@tfhc.org',
    ];

    for (const to of invalidRecipients) {
      await expect(mail.sendEmail({ to, subject: 'Notice', text: 'Test' })).rejects.toThrow(
        /Invalid or undeliverable email recipient/,
      );
    }
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not expose SMTP credentials or server error details when delivery fails', async () => {
    verify.mockRejectedValue(new Error('test-secret authentication rejected'));
    await expect(new MailService(config).verifyConnection()).rejects.toThrow('SMTP connection or authentication failed');

    sendMail.mockResolvedValue({ accepted: [], messageId: 'rejected' });
    await expect(new MailService(config).sendEmail({ to: 'member@tfhc.org', subject: 'Notice', text: 'Test' })).rejects.toThrow(
      'Email delivery failed',
    );
  });
});

