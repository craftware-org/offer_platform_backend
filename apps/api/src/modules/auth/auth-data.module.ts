import { Inject, Injectable, Module } from '@nestjs/common';
import { and, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { otpChallenges, refreshTokens } from './auth.schema.js';

/**
 * Personal-data clean-up for the auth tables (Phase 8): login codes hold a phone number or email
 * address, sessions hold a browser description. Database only, so the worker can load it without
 * the SMS/email senders.
 */
@Injectable()
export class AuthDataService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Login codes older than the cutoff (they are useless after a few minutes anyway). */
  async purgeLoginCodes(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(otpChallenges)
      .where(lt(otpChallenges.createdAt, cutoff))
      .returning({ id: otpChallenges.id });
    return rows.length;
  }

  /** Sessions that ended (logged out, replaced or expired) before the cutoff. */
  async purgeEndedSessions(cutoff: Date): Promise<number> {
    const rows = await this.db
      .delete(refreshTokens)
      .where(
        or(
          and(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.revokedAt, cutoff)),
          lt(refreshTokens.expiresAt, cutoff),
        ),
      )
      .returning({ id: refreshTokens.id });
    return rows.length;
  }

  /** Account deletion: every session and every login code sent to the person's phone or email. */
  async forgetUser(userId: string, destinations: string[], tx: Executor): Promise<void> {
    await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
    if (destinations.length > 0)
      await tx.delete(otpChallenges).where(inArray(otpChallenges.destination, destinations));
  }
}

@Module({ providers: [AuthDataService], exports: [AuthDataService] })
export class AuthDataModule {}
