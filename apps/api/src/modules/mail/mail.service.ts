import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { validateEmail, normalizeEmail } from '@tfhc/shared';

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
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
  // Callers choose recipients explicitly; validates recipient before any dispatch.
  async sendEmail(message: { to: string; subject: string; text: string; html?: string }) {
    const recipient = message?.to;
    const validation = validateEmail(recipient);
    if (!validation.isValid) {
      this.logger.warn(
        `[BLOCKED EMAIL DISPATCH] Refusing to dispatch email to invalid/placeholder recipient: '${recipient}'. Reason: ${validation.reason}`
      );
      throw new BadRequestException(
        `Invalid or undeliverable email recipient: ${validation.reason || 'Invalid email address'}`
      );
    }

    try {
      const fromAddress = this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER');
      const replyTo = this.config.get<string>('SMTP_REPLY_TO') || fromAddress;
      const result = await this.getTransport().sendMail({
        from: fromAddress,
        to: validation.normalizedEmail,
        replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: {
          'X-Mailer': 'TFHC Orderliness Notification System',
          'X-Auto-Response-Suppress': 'OOF, AutoReply',
          'X-Entity-Ref-ID': Buffer.from(validation.normalizedEmail).toString('base64url'),
          'X-Priority': '3',
          'Importance': 'Normal',
        },
      });
      if (!result.accepted?.length) throw new Error('Recipient rejected');
      return { messageId: result.messageId };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Email delivery to ${validation.normalizedEmail} failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Email delivery failed');
    }
  }

  onModuleDestroy() { this.transport?.close(); }
}

