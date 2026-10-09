import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal, Public, RequestId, RequirePermissions } from '../../common/auth/decorators.js';
import type { Principal } from '../../common/auth/principal.js';
import { Permission } from '../access-control/access-control.catalog.js';
import { AuthService } from './auth.service.js';
import { MfaService } from './mfa.service.js';

const totpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app');
const codeSchema = z.strictObject({ code: totpCode });
const verifySchema = z
  .strictObject({
    mfaToken: z.string().min(20).max(2000),
    code: totpCode.optional(),
    recoveryCode: z.string().trim().min(8).max(20).optional(),
  })
  .refine((v) => !!v.code !== !!v.recoveryCode, {
    message: 'Send the app code or a recovery code',
    path: ['code'],
  });

/** Authenticator-app 2-step login (ADR-0018). */
@ApiTags('Auth')
@Controller()
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Post('auth/mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Second login step when a login answered { mfaRequired, mfaToken }: send the 6-digit app code or a recovery code. ' +
      '5 wrong codes lock it for 15 minutes.',
  })
  verify(
    @Body({ schema: verifySchema }) body: z.infer<typeof verifySchema>,
    @Headers('user-agent') userAgent?: string,
    @RequestId() requestId?: string,
  ) {
    return this.auth.verifyMfa(
      body.mfaToken,
      { code: body.code, recoveryCode: body.recoveryCode },
      { userAgent, requestId },
    );
  }

  @Get('me/mfa')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Whether 2-step login is on, and how many recovery codes are left' })
  status(@CurrentPrincipal() p: Principal) {
    return this.mfa.status(p.userId);
  }

  @Post('me/mfa/setup')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start setting up an authenticator app: secret, otpauth link and QR code (valid 10 minutes)',
  })
  setup(@CurrentPrincipal() p: Principal) {
    return this.mfa.startSetup(p.userId);
  }

  @Post('me/mfa/enable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirm the first app code: turns 2-step login on, returns 10 recovery codes (shown once) and new tokens. Other sessions end.',
  })
  enable(
    @Body({ schema: codeSchema }) body: z.infer<typeof codeSchema>,
    @CurrentPrincipal() p: Principal,
    @Headers('user-agent') userAgent?: string,
    @RequestId() requestId?: string,
  ) {
    return this.mfa.enable(p.userId, body.code, { userAgent, requestId });
  }

  @Post('me/mfa/recovery-codes')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'New recovery codes (needs a current app code); the old ones stop working' })
  async recoveryCodes(
    @Body({ schema: codeSchema }) body: z.infer<typeof codeSchema>,
    @CurrentPrincipal() p: Principal,
    @RequestId() requestId?: string,
  ) {
    return { recoveryCodes: await this.mfa.regenerateRecoveryCodes(p.userId, body.code, { requestId }) };
  }

  @Post('me/mfa/disable')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Turn 2-step login off (needs a current app code). Ends every session; admins lose admin access until set up again.',
  })
  async disable(
    @Body({ schema: codeSchema }) body: z.infer<typeof codeSchema>,
    @CurrentPrincipal() p: Principal,
    @RequestId() requestId?: string,
  ) {
    await this.mfa.disable(p.userId, body.code, { requestId });
  }

  @Get('admin/users/:id/mfa')
  @ApiBearerAuth()
  @RequirePermissions(Permission.USERS_READ)
  @ApiOperation({ summary: "Whether a user's 2-step login is on" })
  async adminStatus(@Param('id', { schema: z.uuid() }) id: string) {
    const s = await this.mfa.status(id);
    return { enabled: s.enabled, enabledAt: s.enabledAt };
  }

  @Post('admin/users/:id/mfa/reset')
  @ApiBearerAuth()
  @RequirePermissions(Permission.ROLES_ASSIGN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Super admin: clear a user's authenticator (lost phone). Ends their sessions; audited.",
  })
  async reset(
    @Param('id', { schema: z.uuid() }) id: string,
    @CurrentPrincipal() p: Principal,
    @RequestId() requestId?: string,
  ) {
    await this.mfa.reset(p.userId, id, { requestId });
  }
}
