import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleDestroy {
  private transport?: nodemailer.Transporter;
  constructor(private readonly config: ConfigService) {}

  private getTransport() {
    if (this.transport) return this.transport;
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const port = Number(this.config.get<string>('SMTP_PORT') || 465);
    if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }
    this.transport = nodemailer.createTransport({
      host, port, secure: port === 465 || this.config.get<string>('SMTP_SECURE') === 'true',
      requireTLS: true,
      auth: { user, pass },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      disableFileAccess: true, disableUrlAccess: true,
      // Keep connections alive so only the first send pays the TLS handshake.
      pool: true, maxConnections: 3, maxMessages: 50,
    });
    return this.transport;
  }

  async verifyConnection() {
    try { await this.getTransport().verify(); return { connected: true }; }
    catch { throw new ServiceUnavailableException('SMTP connection or authentication failed'); }
  }

  // Shared by system jobs and administrator-triggered email workflows.
  // Callers choose recipients explicitly; no email is sent during startup.
  async sendEmail(message: { to: string; subject: string; text: string; html?: string }) {
    try {
      const result = await this.getTransport().sendMail({
        from: this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER'),
        to: message.to, subject: message.subject, text: message.text, html: message.html,
      });
      if (!result.accepted?.length) throw new Error('Recipient rejected');
      return { messageId: result.messageId };
    } catch { throw new ServiceUnavailableException('Email delivery failed'); }
  }

  onModuleDestroy() { this.transport?.close(); }
}
