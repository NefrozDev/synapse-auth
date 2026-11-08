import {
  Body,
  Controller,
  Get,
  GoneException,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type Provider from 'oidc-provider';
import { errors, type InteractionResults } from 'oidc-provider';
import { AccountsService } from '../accounts/accounts.service';
import { LoginDto, RegisterDto } from '../accounts/dto/account.dto';
import { isLocale, type Locale } from '../accounts/locales';
import { FIRST_PARTY_SCOPE, OIDC_PROVIDER } from '../oidc/oidc.constants';
import { AllowedOriginGuard } from '../security/allowed-origin.guard';
import { SENSITIVE_THROTTLE } from '../security/rate-limits';

type Interaction = Awaited<ReturnType<Provider['interactionDetails']>>;

export interface InteractionView {
  uid: string;
  /** "login" asks who you are; "consent" only needs a call to /consent. */
  prompt: string;
  client: { id: string; name: string; uri: string | null };
  loginHint: string | null;
  /** The first language the app asked for (ui_locales) that the site knows. */
  locale: Locale | null;
}

export interface Redirect {
  /** Where the browser goes next: back to the provider, then to the app. */
  redirectTo: string;
}

/**
 * The API behind the sign-in pages. The provider sends the browser to
 * /api/interaction/:uid with a cookie limited to that path; every call below
 * is under it, and works only for the interaction that cookie names.
 */
@Controller('interaction/:uid')
@UseGuards(AllowedOriginGuard)
export class InteractionsController {
  constructor(
    @Inject(OIDC_PROVIDER) private readonly provider: Provider,
    private readonly accounts: AccountsService,
  ) {}

  /** The address the provider redirects to: hands over to the Angular page. */
  @Get()
  open(@Param('uid') uid: string, @Res() res: Response): void {
    res.redirect(303, `/interaction/${encodeURIComponent(uid)}`);
  }

  @Get('details')
  async details(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<InteractionView> {
    const interaction = await this.load(uid, req, res);
    const clientId = String(interaction.params.client_id);
    const client = await this.provider.Client.find(clientId);
    const uiLocales = interaction.params.ui_locales;
    const locales = typeof uiLocales === 'string' ? uiLocales.split(' ') : [];
    return {
      uid: interaction.uid,
      prompt: interaction.prompt.name,
      client: {
        id: clientId,
        name: client?.clientName ?? clientId,
        uri: client?.clientUri ?? null,
      },
      loginHint:
        typeof interaction.params.login_hint === 'string'
          ? interaction.params.login_hint
          : null,
      locale: locales.map((tag) => tag.slice(0, 2)).find(isLocale) ?? null,
    };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(SENSITIVE_THROTTLE)
  async login(
    @Param('uid') uid: string,
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Redirect> {
    await this.load(uid, req, res);
    const account = await this.accounts.verifyCredentials(
      body.login,
      body.password,
    );
    if (!account) {
      throw new UnauthorizedException('The username or password is incorrect.');
    }
    return this.finish(req, res, {
      login: { accountId: account.id, remember: true },
    });
  }

  @Post('register')
  @HttpCode(200)
  @Throttle(SENSITIVE_THROTTLE)
  async register(
    @Param('uid') uid: string,
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Redirect> {
    await this.load(uid, req, res);
    const account = await this.accounts.register({
      username: body.username,
      email: body.email,
      password: body.password,
      givenName: body.givenName,
      familyName: body.familyName,
      locale: body.locale ?? 'fr',
    });
    return this.finish(req, res, {
      login: { accountId: account.id, remember: true },
    });
  }

  /**
   * Every app is first-party, so the provider rarely asks for consent (only
   * when an app requests prompt=consent): granting it needs no question.
   */
  @Post('consent')
  @HttpCode(200)
  async consent(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Redirect> {
    const interaction = await this.load(uid, req, res);
    const accountId = interaction.session?.accountId;
    if (interaction.prompt.name !== 'consent' || !accountId) {
      throw new GoneException('This sign-in does not ask for consent.');
    }
    const grant = interaction.grantId
      ? await this.provider.Grant.find(interaction.grantId)
      : new this.provider.Grant({
          clientId: String(interaction.params.client_id),
          accountId,
        });
    if (!grant) {
      throw new GoneException('This sign-in has expired.');
    }
    grant.addOIDCScope(FIRST_PARTY_SCOPE);
    const grantId = await grant.save();
    return this.finish(req, res, { consent: { grantId } }, true);
  }

  /** "Back to the app" without signing in. */
  @Post('abort')
  @HttpCode(200)
  async abort(
    @Param('uid') uid: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Redirect> {
    await this.load(uid, req, res);
    return this.finish(req, res, {
      error: 'access_denied',
      error_description: 'The person went back without signing in.',
    });
  }

  private async load(
    uid: string,
    req: Request,
    res: Response,
  ): Promise<Interaction> {
    let interaction: Interaction;
    try {
      interaction = await this.provider.interactionDetails(req, res);
    } catch (error) {
      if (error instanceof errors.SessionNotFound) {
        throw new GoneException('This sign-in has expired.');
      }
      throw error;
    }
    // Another tab started a newer sign-in: this page's one is gone.
    if (interaction.uid !== uid) {
      throw new GoneException('This sign-in has expired.');
    }
    return interaction;
  }

  private async finish(
    req: Request,
    res: Response,
    result: InteractionResults,
    merge = false,
  ): Promise<Redirect> {
    const redirectTo = await this.provider.interactionResult(req, res, result, {
      mergeWithLastSubmission: merge,
    });
    return { redirectTo };
  }
}
