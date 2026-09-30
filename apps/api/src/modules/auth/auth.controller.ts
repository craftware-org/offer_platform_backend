import { Body, Controller, Delete, HttpCode, HttpStatus, Ip, Post, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, Public, RequestId } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { AuthService } from './auth.service.js';

const phoneField = z.string().trim().min(5).max(20);

const requestOtpSchema = z.strictObject({ phone: phoneField });
const verifyOtpSchema = z.strictObject({
  phone: phoneField,
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, 'Code must be 4-8 digits'),
});
const refreshTokenSchema = z.strictObject({ refreshToken: z.string().min(20).max(200) });

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send a one-time code to a phone number (login and registration)' })
  requestOtp(@Body({ schema: requestOtpSchema }) body: z.infer<typeof requestOtpSchema>, @Ip() ip: string) {
    return this.auth.requestOtp(body.phone, ip);
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
    return this.auth.verifyOtp(body.phone, body.code, { userAgent, requestId });
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
