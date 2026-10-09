import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { AppError, ErrorCode } from '../../common/errors/app-error.js';
import { APP_CONFIG, type AppConfig } from '../../config/config.module.js';
import { DB, type Database, type Executor } from '../../infrastructure/database/database.module.js';
import { refreshTokens } from './auth.schema.js';

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AccessTokenPayload {
  sub: string;
  /** The login passed the authenticator step (ADR-0018). */
  mfa?: boolean;
}

export const invalidRefreshToken = () =>
  new AppError(ErrorCode.INVALID_REFRESH_TOKEN, HttpStatus.UNAUTHORIZED, 'Invalid or expired refresh token');

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export type RotationOutcome =
  | { kind: 'rotated'; userId: string; tokens: TokenPair }
  | { kind: 'reused'; userId: string; familyId: string }
  | { kind: 'invalid' };

@Injectable()
export class TokenService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  /** Starts a new session. `mfa`: the login passed the authenticator step (kept on every rotation). */
  async issue(userId: string, userAgent: string | undefined, db: Executor, mfa = false): Promise<TokenPair> {
    const { value, row } = this.newRefreshToken(userId, uuidv7(), userAgent, mfa);
    await db.insert(refreshTokens).values(row);
    return this.pair(userId, value, row.expiresAt, mfa);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<Partial<AccessTokenPayload>>(token);
      return typeof payload.sub === 'string' ? { sub: payload.sub, mfa: payload.mfa === true } : null;
    } catch {
      return null;
    }
  }

  /** Finds the user a refresh token belongs to, without consuming it. */
  async ownerOf(presented: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: refreshTokens.userId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(presented)))
      .limit(1);
    return row?.userId ?? null;
  }

  /**
   * Single-use rotation. Presenting a token that was already exchanged for a newer one signals
   * theft: the caller must revoke the whole family (outside this transaction so it is not rolled back).
   * A token revoked for another reason (logout, family revocation) is simply invalid.
   */
  async rotate(presented: string, userAgent: string | undefined): Promise<RotationOutcome> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, sha256(presented)))
        .limit(1);
      if (!current) return { kind: 'invalid' } as const;
      if (current.revokedAt) {
        return current.replacedById
          ? ({ kind: 'reused', userId: current.userId, familyId: current.familyId } as const)
          : ({ kind: 'invalid' } as const);
      }
      if (current.expiresAt <= new Date()) return { kind: 'invalid' } as const;

      const [claimed] = await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.id, current.id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      if (!claimed) return { kind: 'reused', userId: current.userId, familyId: current.familyId } as const;

      const next = this.newRefreshToken(current.userId, current.familyId, userAgent, current.mfa);
      await tx.insert(refreshTokens).values(next.row);
      await tx
        .update(refreshTokens)
        .set({ replacedById: next.row.id })
        .where(eq(refreshTokens.id, current.id));
      return {
        kind: 'rotated',
        userId: current.userId,
        tokens: await this.pair(current.userId, next.value, next.row.expiresAt, current.mfa),
      } as const;
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  /** Logout: revokes the presented token's whole session. Unknown tokens are ignored. */
  async revokeSessionOf(presented: string): Promise<void> {
    const [row] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, sha256(presented)))
      .limit(1);
    if (row) await this.revokeFamily(row.familyId);
  }

  async revokeAllForUser(userId: string, db: Executor = this.db): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  private newRefreshToken(userId: string, familyId: string, userAgent: string | undefined, mfa: boolean) {
    const value = randomBytes(32).toString('base64url');
    const row = {
      id: uuidv7(),
      userId,
      familyId,
      tokenHash: sha256(value),
      expiresAt: new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      userAgent: userAgent?.slice(0, 255) ?? null,
      mfa,
    };
    return { value, row };
  }

  private async pair(
    userId: string,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
    mfa: boolean,
  ): Promise<TokenPair> {
    const payload: AccessTokenPayload = mfa ? { sub: userId, mfa: true } : { sub: userId };
    return {
      accessToken: await this.jwt.signAsync(payload),
      accessTokenExpiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }
}
