import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ClientMetadata } from 'oidc-provider';
import type { Account } from '../accounts/account.entity';
import { AccountsService } from '../accounts/accounts.service';
import {
  EmailChangeDto,
  PasswordChangeDto,
  PasswordConfirmationDto,
  ProfileDto,
} from '../accounts/dto/account.dto';
import { isLocale } from '../accounts/locales';
import { AppConfig } from '../config/app-config';
import { AccountDeletionService } from '../deletion/account-deletion.service';
import type { CurrentSession } from '../oidc/oidc-sessions.service';
import { OidcSessionsService } from '../oidc/oidc-sessions.service';
import { OIDC_CLIENTS } from '../oidc/oidc.constants';
import { AllowedOriginGuard } from '../security/allowed-origin.guard';
import { SENSITIVE_THROTTLE } from '../security/rate-limits';
import { AccountSessionGuard, SignedIn } from './account-session.guard';

/** The account page's own client in the clients file. */
export const ACCOUNT_CLIENT_ID = 'account';
const SIGN_IN_COOKIE = 'account_sign_in';
const SIGN_IN_MINUTES = 10;
const WRONG_PASSWORD_MESSAGE = 'The password is incorrect.';

export interface AppLink {
  id: string;
  name: string;
  uri: string;
}

export interface AccountResponse {
  id: string;
  username: string;
  email: string;
  givenName: string;
  familyName: string;
  locale: string;
  createdAt: string;
  /** The Synapse apps this account opens. */
  apps: AppLink[];
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function wrongPassword(): BadRequestException {
  // Shaped like a validation error, so the page shows it on the field.
  return new BadRequestException({
    statusCode: 400,
    message: [WRONG_PASSWORD_MESSAGE],
    field: 'password',
  });
}

/**
 * The account page's API. It reads the provider's session, the shared
 * sign-in of every Synapse app, so signing in here or in any app is the same.
 */
@Controller('account')
@UseGuards(AllowedOriginGuard)
export class AccountController {
  private readonly apps: AppLink[];

  constructor(
    private readonly accounts: AccountsService,
    private readonly sessions: OidcSessionsService,
    private readonly deletion: AccountDeletionService,
    private readonly config: AppConfig,
    @Inject(OIDC_CLIENTS) clients: ClientMetadata[],
  ) {
    this.apps = clients.flatMap((client) =>
      client.client_id !== ACCOUNT_CLIENT_ID &&
      typeof client.client_uri === 'string'
        ? [
            {
              id: client.client_id,
              name: String(client.client_name ?? client.client_id),
              uri: client.client_uri,
            },
          ]
        : [],
    );
  }

  /**
   * Starts a sign-in for the account page itself: an ordinary authorization
   * request, so it shows the same pages and opens the shared session.
   */
  @Get('sign-in')
  signIn(@Query('lang') lang: string | undefined, @Res() res: Response): void {
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    res.cookie(SIGN_IN_COOKIE, state, {
      ...this.cookieOptions(),
      maxAge: SIGN_IN_MINUTES * 60 * 1000,
    });
    const url = new URL(`${this.config.issuer}/auth`);
    url.search = new URLSearchParams({
      client_id: ACCOUNT_CLIENT_ID,
      response_type: 'code',
      scope: 'openid',
      redirect_uri: `${this.config.publicUrl}/api/account/callback`,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      ...(isLocale(lang) ? { ui_locales: lang } : {}),
    }).toString();
    res.redirect(303, url.toString());
  }

  /**
   * Back from signing in. The page needs no token: what it reads is the
   * provider's session, now open. The state check refuses a sign-in this
   * browser did not start.
   */
  @Get('callback')
  callback(
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const expected = (req.cookies as Record<string, string | undefined>)[
      SIGN_IN_COOKIE
    ];
    res.clearCookie(SIGN_IN_COOKIE, this.cookieOptions());
    const valid = !!state && !!expected && sameText(state, expected);
    res.redirect(303, valid ? '/account' : '/account?signInFailed=1');
  }

  @Get()
  @UseGuards(AccountSessionGuard)
  async me(@SignedIn() session: CurrentSession): Promise<AccountResponse> {
    const account = await this.accounts.findById(session.accountId);
    if (!account) {
      // Deleted on another browser while this one was still signed in.
      throw new BadRequestException('This account no longer exists.');
    }
    return this.view(account);
  }

  @Patch()
  @UseGuards(AccountSessionGuard)
  async updateProfile(
    @SignedIn() session: CurrentSession,
    @Body() body: ProfileDto,
  ): Promise<AccountResponse> {
    return this.view(
      await this.accounts.updateProfile(session.accountId, body),
    );
  }

  @Put('email')
  @UseGuards(AccountSessionGuard)
  @Throttle(SENSITIVE_THROTTLE)
  async changeEmail(
    @SignedIn() session: CurrentSession,
    @Body() body: EmailChangeDto,
  ): Promise<AccountResponse> {
    if (
      !(await this.accounts.changeEmail(
        session.accountId,
        body.password,
        body.email,
      ))
    ) {
      throw wrongPassword();
    }
    return this.view(await this.findOrFail(session.accountId));
  }

  /** Keeps this browser signed in; every other one, in every app, is signed out. */
  @Put('password')
  @HttpCode(204)
  @UseGuards(AccountSessionGuard)
  @Throttle(SENSITIVE_THROTTLE)
  async changePassword(
    @SignedIn() session: CurrentSession,
    @Body() body: PasswordChangeDto,
  ): Promise<void> {
    const changed = await this.accounts.changePassword(
      session.accountId,
      body.currentPassword,
      body.newPassword,
    );
    if (!changed) {
      throw new BadRequestException({
        statusCode: 400,
        message: [WRONG_PASSWORD_MESSAGE],
        field: 'currentPassword',
      });
    }
    await this.sessions.signOutEverywhere(session.accountId, session.sessionId);
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.signOutHere(req, res);
  }

  @Post('sign-out-everywhere')
  @HttpCode(204)
  @UseGuards(AccountSessionGuard)
  async signOutEverywhere(
    @SignedIn() session: CurrentSession,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.signOutEverywhere(session.accountId);
    await this.sessions.signOutHere(req, res);
  }

  /**
   * Deletes the account once the password matches: every session ends, every
   * app is told to erase what it holds, and the account's rows here go.
   */
  @Delete()
  @HttpCode(204)
  @UseGuards(AccountSessionGuard)
  @Throttle(SENSITIVE_THROTTLE)
  async delete(
    @SignedIn() session: CurrentSession,
    @Body() body: PasswordConfirmationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const accountId = session.accountId;
    // Checked before anything ends: a wrong password changes nothing.
    if (!(await this.accounts.passwordMatches(accountId, body.password))) {
      throw wrongPassword();
    }
    await this.sessions.signOutEverywhere(accountId);
    await this.sessions.signOutHere(req, res);
    await this.accounts.delete(accountId);
    await this.deletion.notifyApps(accountId);
  }

  private async findOrFail(id: string): Promise<Account> {
    const account = await this.accounts.findById(id);
    if (!account)
      throw new BadRequestException('This account no longer exists.');
    return account;
  }

  private view(account: Account): AccountResponse {
    return {
      id: account.id,
      username: account.username,
      email: account.email,
      givenName: account.givenName,
      familyName: account.familyName,
      locale: account.locale,
      createdAt: account.createdAt.toISOString(),
      apps: this.apps,
    };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.production,
      path: '/api/account',
    };
  }
}
