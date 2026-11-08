import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { Account } from '../accounts/account.entity';
import { normalizeIdentifier } from '../accounts/identifiers';
import { PasswordService } from '../accounts/password.service';
import { describeError } from '../common/describe-error';
import { AppConfig } from '../config/app-config';
import { MailService } from '../mail/mail.service';
import { OidcSessionsService } from '../oidc/oidc-sessions.service';
import { PasswordReset } from './password-reset.entity';
import { passwordResetMail } from './password-reset.mail';

export const RESET_VALID_MINUTES = 30;
export const INVALID_RESET_MESSAGE =
  'This link no longer works. Ask for a new one.';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Password recovery by e-mail. Asking never says whether the address has an
 * account; the link carries a single-use token valid for RESET_VALID_MINUTES,
 * and using it signs the account out everywhere, in every app.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly sessions: OidcSessionsService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Resolves once the token is stored; the e-mail leaves in the background, so
   * an existing address does not answer measurably later than an unknown one.
   */
  async request(email: string): Promise<void> {
    const account = await this.dataSource.manager.findOne(Account, {
      where: { normalizedEmail: normalizeIdentifier(email) },
    });
    if (!account) return;

    const token = randomBytes(32).toString('base64url');
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PasswordReset, {
        expiresAt: LessThanOrEqual(new Date()),
      });
      // Only the latest link works.
      await manager.delete(PasswordReset, { accountId: account.id });
      await manager.insert(PasswordReset, {
        id: randomUUID(),
        accountId: account.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_VALID_MINUTES * 60 * 1000),
      });
    });

    // A fragment never reaches a server, so proxies cannot log the token.
    const link = `${this.config.publicUrl}/reset-password#token=${token}`;
    void this.deliver(account, link);
  }

  async confirm(token: string, password: string): Promise<void> {
    const pending = await this.dataSource.manager.findOne(PasswordReset, {
      where: { tokenHash: hashToken(token) },
    });
    if (!pending || pending.expiresAt <= new Date()) {
      throw new BadRequestException(INVALID_RESET_MESSAGE);
    }
    // Hashing is slow: done before the transaction.
    const passwordHash = await this.passwords.hash(password);
    await this.dataSource.transaction(async (manager) => {
      // Used meanwhile (a double click, another tab): only once.
      const deleted = await manager.delete(PasswordReset, { id: pending.id });
      if (!deleted.affected) {
        throw new BadRequestException(INVALID_RESET_MESSAGE);
      }
      await manager.update(
        Account,
        { id: pending.accountId },
        { passwordHash },
      );
      await manager.delete(PasswordReset, { accountId: pending.accountId });
    });
    await this.sessions.signOutEverywhere(pending.accountId);
  }

  private async deliver(account: Account, link: string): Promise<void> {
    if (!this.mail.enabled && !this.config.production) {
      // Development without SMTP: the link is the only way to test the flow.
      this.logger.log(`Password reset link for ${account.username}: ${link}`);
      return;
    }
    try {
      await this.mail.send(
        passwordResetMail({
          to: account.email,
          name: account.givenName || account.username,
          locale: account.locale,
          link,
          validMinutes: RESET_VALID_MINUTES,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Password reset e-mail to ${account.username} failed: ${describeError(error)}`,
      );
    }
  }
}
