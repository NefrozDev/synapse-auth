import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

const DEFAULT_SMTP_PORT = 465;

const REQUIRED_IN_PRODUCTION = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'];

/**
 * Sends e-mails through the SMTP server named by SMTP_HOST (in production,
 * Mailcow's). Outside production, without SMTP_HOST nothing is sent, so the
 * API starts on a machine with no mailbox configured; `enabled` tells callers.
 * In production the API refuses to start without SMTP: password resets would
 * otherwise say an e-mail is on its way and send nothing.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    if (config.get<string>('NODE_ENV') === 'production') {
      const missing = REQUIRED_IN_PRODUCTION.filter(
        (name) => !config.get<string>(name)?.trim(),
      );
      if (missing.length > 0) {
        throw new Error(
          `${missing.join(', ')} must be set in production: password reset e-mails cannot be sent.`,
        );
      }
    }
    const host = config.get<string>('SMTP_HOST')?.trim();
    const port = Number(config.get<string>('SMTP_PORT') ?? DEFAULT_SMTP_PORT);
    const user = config.get<string>('SMTP_USER')?.trim();
    this.from = config.get<string>('MAIL_FROM')?.trim() || user || '';
    this.transport = host
      ? createTransport({
          host,
          port,
          // 465 speaks TLS from the start; any other port must upgrade with STARTTLS.
          secure: port === 465,
          requireTLS: port !== 465,
          auth: user
            ? { user, pass: config.get<string>('SMTP_PASSWORD') ?? '' }
            : undefined,
        })
      : null;
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  async send(mail: OutgoingMail): Promise<void> {
    if (!this.transport) {
      this.logger.warn('SMTP_HOST is not set: e-mail not sent.');
      return;
    }
    await this.transport.sendMail({ from: this.from, ...mail });
  }
}
