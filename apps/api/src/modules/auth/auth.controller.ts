import { Body, Controller, Delete, HttpCode, HttpStatus, Ip, Post, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, Public, RequestId } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { AuthService, type LoginIdentity } from './auth.service.js';
import { PASSWORD_MAX_LENGTH } from './password-policy.js';

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
const verifyOtpCode = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'Code must be 4-8 digits');
const verifyOtpSchema = z
  .strictObject({ ...identity, code: verifyOtpCode })
  .refine(exactlyOne, exactlyOneMessage);
const refreshTokenSchema = z.strictObject({ refreshToken: z.string().min(20).max(200) });
// Length/commonness rules are checked in the service (password-policy.ts) so the message is specific.
const password = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const passwordLoginSchema = z.strictObject({ ...identity, password }).refine(exactlyOne, exactlyOneMessage);
const setPasswordSchema = z.strictObject({ password });
const changePasswordSchema = z.strictObject({ currentPassword: password, newPassword: password });
const resetPasswordSchema = z
  .strictObject({
    ...identity,
    code: verifyOtpCode,
    newPassword: password,
  })
  .refine(exactlyOne, exactlyOneMessage);

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
  @Post('password/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with phone or email + password (once set). 5 wrong tries lock the account for 15 minutes.',
  })
  passwordLogin(
    @Body({ schema: passwordLoginSchema }) body: z.infer<typeof passwordLoginSchema>,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @RequestId() requestId?: string,
  ) {
    return this.auth.passwordLogin(toIdentity(body), body.password, ip, { userAgent, requestId });
  }

  @Post('password')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the first password (the account logged in with a code and has none yet)' })
  setPassword(
    @Body({ schema: setPasswordSchema }) body: z.infer<typeof setPasswordSchema>,
    @CurrentPrincipal() principal: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.auth.setInitialPassword(principal.userId, body.password, { requestId });
  }

  @Post('password/change')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change the password (needs the current one). Logs out every other device and returns new tokens.',
  })
  changePassword(
    @Body({ schema: changePasswordSchema }) body: z.infer<typeof changePasswordSchema>,
    @CurrentPrincipal() principal: Principal,
    @Headers('user-agent') userAgent?: string,
    @RequestId() requestId?: string,
  ) {
    return this.auth.changePassword(principal.userId, body.currentPassword, body.newPassword, {
      userAgent,
      requestId,
    });
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Forgot password: get a code from /auth/otp/request, then send it here with the new password. Logs out every device.',
  })
  resetPassword(
    @Body({ schema: resetPasswordSchema }) body: z.infer<typeof resetPasswordSchema>,
    @Headers('user-agent') userAgent?: string,
    @RequestId() requestId?: string,
  ) {
    return this.auth.resetPassword(toIdentity(body), body.code, body.newPassword, { userAgent, requestId });
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
