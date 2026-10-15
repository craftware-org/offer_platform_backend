import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';

/**
 * Port for sending login codes by SMS (ADR-0006). `message` is the full text for providers that
 * send free text; `code` is for providers bound to a DLT-approved template (India), which fill
 * the template's variable with it and ignore `message`.
 */
export abstract class SmsProvider {
  abstract send(toE164: string, message: string, code: string): Promise<void>;
}

export const maskPhone = (e164: string) =>
  e164.length <= 4 ? '****' : `${e164.slice(0, 3)}${'*'.repeat(e164.length - 7)}${e164.slice(-4)}`;

/** Development only (blocked in staging/production by config validation): prints messages to the log. */
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('ConsoleSms');

  async send(toE164: string, message: string): Promise<void> {
    this.logger.warn(`[DEV SMS] to ${maskPhone(toE164)}: ${message}`);
  }
}

/**
 * MSG91 (owner decision 2026-10-09) through its Flow API with a DLT-approved OTP template:
 * `POST /api/v5/flow`, `authkey` header, `{ template_id, short_url, recipients: [{ mobiles, <var> }] }`
 * with the number in international format without "+". Success is `{ type: "success" }`; anything
 * else, a non-2xx status or a timeout is an error. Neither the key nor the code is ever logged.
 */
@Injectable()
export class Msg91SmsProvider extends SmsProvider {
  private readonly logger = new Logger('Msg91Sms');
  private readonly url: string;
  private readonly authKey: string;
  private readonly templateId: string;
  private readonly codeVar: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    if (!config.MSG91_AUTH_KEY || !config.MSG91_OTP_TEMPLATE_ID) {
      throw new Error('MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are required for MSG91');
    }
    this.url = new URL('/api/v5/flow', config.MSG91_BASE_URL).toString();
    this.authKey = config.MSG91_AUTH_KEY;
    this.templateId = config.MSG91_OTP_TEMPLATE_ID;
    this.codeVar = config.MSG91_OTP_CODE_VAR;
  }

  async send(toE164: string, _message: string, code: string): Promise<void> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authkey: this.authKey },
      body: JSON.stringify({
        template_id: this.templateId,
        short_url: '0',
        recipients: [{ mobiles: toE164.replace(/^\+/, ''), [this.codeVar]: code }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
    if (!res.ok || body?.type !== 'success') {
      const reason = `MSG91 refused the SMS to ${maskPhone(toE164)} (HTTP ${res.status}): ${body?.message ?? 'no response body'}`;
      this.logger.error(reason);
      throw new Error(reason);
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: SmsProvider,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): SmsProvider =>
        config.SMS_PROVIDER === 'msg91' ? new Msg91SmsProvider(config) : new ConsoleSmsProvider(),
    },
  ],
  exports: [SmsProvider],
})
export class SmsModule {}
