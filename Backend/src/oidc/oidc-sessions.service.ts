import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type Provider from 'oidc-provider';
import { DataSource } from 'typeorm';
import { describeError } from '../common/describe-error';
import { OIDC_PROVIDER } from './oidc.constants';

type ProviderSession = InstanceType<Provider['Session']>;

/** The typings leave out this method of oidc-provider's Client. */
interface BackchannelClient {
  backchannelLogout(sub: string, sid: string): Promise<void>;
}

export interface CurrentSession {
  accountId: string;
  /** The provider's id for this browser's session. */
  sessionId: string;
}

/**
 * Reads and ends the provider's sessions: the one shared sign-in a browser has
 * across every Synapse app. Ending one tells each app that used it
 * (back-channel logout), and revokes what the app was granted.
 */
@Injectable()
export class OidcSessionsService {
  private readonly logger = new Logger(OidcSessionsService.name);

  constructor(
    @Inject(OIDC_PROVIDER) private readonly provider: Provider,
    private readonly dataSource: DataSource,
  ) {}

  /** Who is signed in on this browser, or null. */
  async current(req: Request, res: Response): Promise<CurrentSession | null> {
    const session = await this.provider.Session.get(
      this.provider.createContext(req, res),
    );
    return session.accountId
      ? { accountId: session.accountId, sessionId: session.jti }
      : null;
  }

  /** Signs this browser out of every app, and forgets its session cookie. */
  async signOutHere(req: Request, res: Response): Promise<void> {
    const ctx = this.provider.createContext(req, res);
    const session = await this.provider.Session.get(ctx);
    if (session.accountId) {
      await this.end(session);
    }
    ctx.cookies.set(this.provider.cookieName('session'), null);
  }

  /**
   * Signs an account out on every browser and in every app, except the
   * session named by `keep` (the browser changing its password).
   */
  async signOutEverywhere(accountId: string, keep?: string): Promise<void> {
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT id FROM oidc_payloads WHERE model = 'Session' AND account_id = $1`,
      [accountId],
    );
    const sessions = await Promise.all(
      rows
        .filter(({ id }) => id !== keep)
        .map(({ id }) => this.provider.Session.find(id)),
    );
    await Promise.all(
      sessions.flatMap((session) => (session ? [this.end(session)] : [])),
    );
  }

  private async end(session: ProviderSession): Promise<void> {
    await Promise.all(
      Object.keys(session.authorizations ?? {}).map((clientId) =>
        this.endFor(session, clientId),
      ),
    );
    await session.destroy();
  }

  /** Tells one app its session ended, then revokes what the app was granted. */
  private async endFor(
    session: ProviderSession,
    clientId: string,
  ): Promise<void> {
    const accountId = session.accountId;
    const client = await this.provider.Client.find(clientId);
    if (accountId && client?.backchannelLogoutUri) {
      // An app that is down must not keep the person signed in here.
      await (client as unknown as BackchannelClient)
        .backchannelLogout(accountId, session.sidFor(clientId) ?? '')
        .catch((error: unknown) =>
          this.logger.warn(
            `Back-channel logout to ${clientId} failed: ${describeError(error)}`,
          ),
        );
    }
    const grantId = session.grantIdFor(clientId);
    if (grantId) {
      await this.dataSource.query(
        `DELETE FROM oidc_payloads WHERE grant_id = $1 OR (model = 'Grant' AND id = $1)`,
        [grantId],
      );
    }
  }
}
