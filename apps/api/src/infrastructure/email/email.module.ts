import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Port for sending email (login codes now; notifications later). */
export abstract class EmailProvider {
  abstract send(message: EmailMessage): Promise<void>;
}

export const maskEmail = (email: string) => {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
};

/** Development/preview only (enforced by config validation): writes emails to the log. */
@Injectable()
export class ConsoleEmailProvider extends EmailProvider {
  private readonly logger = new Logger('ConsoleEmail');

  async send(message: EmailMessage): Promise<void> {
    this.logger.warn(`[DEV EMAIL] to ${maskEmail(message.to)} | ${message.subject} | ${message.text}`);
  }
}

/** SMTP delivery, e.g. Gmail (smtp.gmail.com:465 with an App Password). */
@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.from = config.EMAIL_FROM ?? '';
    this.transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: EmailProvider,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): EmailProvider =>
        config.EMAIL_PROVIDER === 'smtp' ? new SmtpEmailProvider(config) : new ConsoleEmailProvider(),
    },
  ],
  exports: [EmailProvider],
})
export class EmailModule {}
