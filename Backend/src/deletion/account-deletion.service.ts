import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { importJWK, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import type { ClientMetadata } from 'oidc-provider';
import { LessThanOrEqual, Repository } from 'typeorm';
import { describeError } from '../common/describe-error';
import { AppConfig } from '../config/app-config';
import { OIDC_CLIENTS, OIDC_KEYS } from '../oidc/oidc.constants';
import type { ProviderKeys } from '../oidc/provider-keys';
import { AccountDeletionNotice } from './account-deletion-notice.entity';

/** The event apps receive, in the style of a Security Event Token (RFC 8417). */
export const ACCOUNT_DELETED_EVENT =
  'https://auth.synapseengineering.dev/events/account-deleted';

const POLL_INTERVAL_MS = 60 * 1000;
const BATCH_SIZE = 20;
const MAX_DELAY_MINUTES = 6 * 60;
/** After this, the app is reported in the log and no longer tried. */
const GIVE_UP_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;

/** 1, 2, 4… minutes after each failure, at most six hours. */
export function retryDelayMinutes(attempts: number): number {
  return Math.min(2 ** Math.max(attempts - 1, 0), MAX_DELAY_MINUTES);
}

/**
 * Tells every app that keeps data about people when an account is deleted,
 * so each erases what it holds. Notices are stored first and sent until each
 * app answers 2xx, so an app that is down hears about it once it is back.
 */
@Injectable()
export class AccountDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionService.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    @InjectRepository(AccountDeletionNotice)
    private readonly notices: Repository<AccountDeletionNotice>,
    @Inject(OIDC_CLIENTS) private readonly clients: ClientMetadata[],
    @Inject(OIDC_KEYS) private readonly keys: ProviderKeys,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.deliverDue(), POLL_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Queues a notice for every app with an account_deletion_uri, then sends. */
  async notifyApps(accountId: string): Promise<void> {
    const targets = this.clients.filter((client) => this.uriOf(client));
    if (targets.length === 0) return;
    await this.notices.insert(
      targets.map((client) => ({
        id: randomUUID(),
        accountId,
        clientId: client.client_id,
        nextAttemptAt: new Date(),
      })),
    );
    void this.deliverDue();
  }

  /** Sends what is due; one run at a time. Resolves when it is done. */
  deliverDue(): Promise<void> {
    this.running ??= this.deliverBatch().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async deliverBatch(): Promise<void> {
    try {
      const due = await this.notices.find({
        where: { nextAttemptAt: LessThanOrEqual(new Date()) },
        order: { nextAttemptAt: 'ASC' },
        take: BATCH_SIZE,
      });
      await Promise.all(due.map((notice) => this.deliver(notice)));
    } catch (error) {
      this.logger.error(
        `Account deletion notices failed: ${describeError(error)}`,
      );
    }
  }

  private async deliver(notice: AccountDeletionNotice): Promise<void> {
    const client = this.clients.find((c) => c.client_id === notice.clientId);
    const uri = client && this.uriOf(client);
    if (!uri) {
      // The app was removed from the clients file: nobody left to tell.
      await this.notices.delete({ id: notice.id });
      return;
    }
    try {
      const response = await fetch(uri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/secevent+jwt' },
        body: await this.sign(notice),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await this.notices.delete({ id: notice.id });
    } catch (error) {
      await this.reschedule(notice, describeError(error));
    }
  }

  private async reschedule(
    notice: AccountDeletionNotice,
    reason: string,
  ): Promise<void> {
    const attempts = notice.attempts + 1;
    if (Date.now() - notice.createdAt.getTime() > GIVE_UP_AFTER_MS) {
      this.logger.error(
        `${notice.clientId} never confirmed the deletion of account ${notice.accountId} (${reason}): erase it there by hand.`,
      );
      await this.notices.delete({ id: notice.id });
      return;
    }
    this.logger.warn(
      `Telling ${notice.clientId} about a deleted account failed (${reason}); attempt ${attempts}.`,
    );
    await this.notices.update(
      { id: notice.id },
      {
        attempts,
        lastError: reason.slice(0, 500),
        nextAttemptAt: new Date(
          Date.now() + retryDelayMinutes(attempts) * 60_000,
        ),
      },
    );
  }

  /** Signed with the provider's key, so apps check it against /oidc/jwks. */
  private async sign(notice: AccountDeletionNotice): Promise<string> {
    const jwk = this.keys.jwks.keys[0];
    const key = await importJWK(jwk, 'RS256');
    return new SignJWT({ events: { [ACCOUNT_DELETED_EVENT]: {} } })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'secevent+jwt' })
      .setIssuer(this.config.issuer)
      .setAudience(notice.clientId)
      .setSubject(notice.accountId)
      .setJti(notice.id)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(key);
  }

  private uriOf(client: ClientMetadata): string | undefined {
    const uri: unknown = client.account_deletion_uri;
    return typeof uri === 'string' ? uri : undefined;
  }
}
