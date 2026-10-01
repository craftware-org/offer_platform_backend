import { Body, Controller, Delete, HttpCode, HttpStatus, Ip, Post, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, Public, RequestId } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { AuthService, type LoginIdentity } from './auth.service.js';

const identity = {
  phone: z.string().trim().min(5).max(20).optional(),
  email: z.email().max(254).optional(),
};
const exactlyOne = (v: { phone?: string; email?: string }) =>
  (v.phone === undefined) !== (v.email === undefined);
const exactlyOneMessage = { message: 'Provide either phone or email', path: ['phone'] };
const toIdentity = (v: { phone?: string; email?: string }): LoginIdentity =>
  v.phone !== undefined ? { phone: v.phone } : { email: v.email! };

const requestOtpSchema = z.strictObject(identity).refine(exactlyOne, exactlyOneMessage);
const verifyOtpSchema = z
  .strictObject({
    ...identity,
    code: z
      .string()
      .trim()
      .regex(/^\d{4,8}$/, 'Code must be 4-8 digits'),
  })
  .refine(exactlyOne, exactlyOneMessage);
const refreshTokenSchema = z.strictObject({ refreshToken: z.string().min(20).max(200) });

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send a one-time login code by SMS (phone) or email (login and registration)' })
  requestOtp(@Body({ schema: requestOtpSchema }) body: z.infer<typeof requestOtpSchema>, @Ip() ip: string) {
    return this.auth.requestOtp(toIdentity(body), ip);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify the code; returns tokens. Creates the account on first login.' })
  verifyOtp(
    @Body({ schema: verifyOtpSchema }) body: z.infer<typeof verifyOtpSchema>,
    @Headers('user-agent') userAgent?: string,
    @RequestId() requestId?: string,
  ) {
    return this.auth.verifyOtp(toIdentity(body), body.code, { userAgent, requestId });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair (single use, rotating)' })
  refresh(
    @Body({ schema: refreshTokenSchema }) body: z.infer<typeof refreshTokenSchema>,
    @Headers('user-agent') userAgent?: string,
    @RequestId() requestId?: string,
  ) {
    return this.auth.refresh(body.refreshToken, { userAgent, requestId });
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the session that owns this refresh token' })
  async logout(@Body({ schema: refreshTokenSchema }) body: z.infer<typeof refreshTokenSchema>) {
    await this.auth.logout(body.refreshToken);
  }

  @Delete('account')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete own account: erases personal data, ends all sessions' })
  async deleteAccount(@CurrentPrincipal() principal: Principal, @RequestId() requestId?: string) {
    await this.auth.deleteAccount(principal.userId, { requestId });
  }
}
