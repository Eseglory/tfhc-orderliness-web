import { ConfigService } from '@nestjs/config';
import { MailService } from '../src/modules/mail/mail.service';
import * as nodemailer from 'nodemailer';
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('SMTP mail service', () => {
  const verify = jest.fn();
  const sendMail = jest.fn();
  const close = jest.fn();
  const config = new ConfigService({ SMTP_HOST: 'mail.example.test', SMTP_PORT: '465', SMTP_USER: 'system@example.test', SMTP_PASSWORD: 'test-secret', SMTP_FROM: 'System <system@example.test>' });
  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ verify, sendMail, close });
  });
  it('verifies authenticated TLS without sending a message', async () => {
    verify.mockResolvedValue(true);
    const mail = new MailService(config);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    await expect(mail.verifyConnection()).resolves.toEqual({ connected: true });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true, requireTLS: true, tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, disableFileAccess: true, disableUrlAccess: true }));
    expect(sendMail).not.toHaveBeenCalled();
    mail.onModuleDestroy();
    expect(close).toHaveBeenCalled();
  });
  it('uses the configured sender for explicit delivery requests', async () => {
    sendMail.mockResolvedValue({ messageId: 'test-id', accepted: ['member@example.test'] });
    const mail = new MailService(config);
    await expect(mail.sendEmail({ to: 'member@example.test', subject: 'Notice', text: 'Test' })).resolves.toEqual({ messageId: 'test-id' });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'System <system@example.test>', to: 'member@example.test' }));
  });
  it('does not expose SMTP credentials or server error details', async () => {
    verify.mockRejectedValue(new Error('test-secret authentication rejected'));
    await expect(new MailService(config).verifyConnection()).rejects.toThrow('SMTP connection or authentication failed');
    sendMail.mockResolvedValue({ accepted: [], messageId: 'rejected' });
    await expect(new MailService(config).sendEmail({ to: 'member@example.test', subject: 'Notice', text: 'Test' })).rejects.toThrow('Email delivery failed');
  });
});
