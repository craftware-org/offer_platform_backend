import { Global, Injectable, Logger, Module } from '@nestjs/common';

/** Port for sending SMS. The real vendor (DLT-registered) will be another implementation (ADR-0006). */
export abstract class SmsProvider {
  abstract send(toE164: string, message: string): Promise<void>;
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

@Global()
@Module({
  providers: [{ provide: SmsProvider, useClass: ConsoleSmsProvider }],
  exports: [SmsProvider],
})
export class SmsModule {}
