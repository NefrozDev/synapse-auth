import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Account } from './account.entity';
import {
  isUniqueConstraintError,
  normalizeIdentifier as normalize,
} from './identifiers';
import type { Locale } from './locales';
import { PasswordService } from './password.service';

export const IDENTIFIER_TAKEN_MESSAGE =
  'This username or e-mail address is already used.';

export interface NewAccount {
  username: string;
  email: string;
  password: string;
  givenName: string;
  familyName: string;
  locale: Locale;
}

export interface ProfileChanges {
  username?: string;
  givenName?: string;
  familyName?: string;
  locale?: Locale;
}

/** What an account shows of itself: never its password hash. */
export type AccountView = Omit<
  Account,
  'passwordHash' | 'normalizedUsername' | 'normalizedEmail'
>;

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    private readonly passwords: PasswordService,
  ) {}

  async register(details: NewAccount): Promise<Account> {
    const normalizedUsername = normalize(details.username);
    const normalizedEmail = normalize(details.email);
    const duplicate = await this.accounts.exists({
      where: [{ normalizedUsername }, { normalizedEmail }],
    });
    if (duplicate) {
      throw new ConflictException(IDENTIFIER_TAKEN_MESSAGE);
    }

    const passwordHash = await this.passwords.hash(details.password);
    try {
      return await this.accounts.save(
        this.accounts.create({
          id: randomUUID(),
          username: details.username.trim(),
          normalizedUsername,
          email: details.email.trim(),
          normalizedEmail,
          passwordHash,
          givenName: details.givenName.trim(),
          familyName: details.familyName.trim(),
          locale: details.locale,
          termsAcceptedAt: new Date(),
        }),
      );
    } catch (error) {
      // A concurrent registration took the name between the check and the insert.
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(IDENTIFIER_TAKEN_MESSAGE);
      }
      throw error;
    }
  }

  /**
   * The account a username or an e-mail address and its password open, or
   * null. Unknown names cost a hash too, so timing does not reveal accounts.
   */
  async verifyCredentials(
    login: string,
    password: string,
  ): Promise<Account | null> {
    const account = await this.withPasswordHash(login);
    const valid = await this.passwords.verify(password, account?.passwordHash);
    return account && valid ? account : null;
  }

  findById(id: string): Promise<Account | null> {
    return this.accounts.findOneBy({ id });
  }

  async updateProfile(id: string, changes: ProfileChanges): Promise<Account> {
    const update: Partial<Account> = {
      givenName: changes.givenName?.trim(),
      familyName: changes.familyName?.trim(),
      locale: changes.locale,
    };
    if (changes.username !== undefined) {
      const normalizedUsername = normalize(changes.username);
      const taken = await this.accounts.exists({
        where: { normalizedUsername },
      });
      const current = await this.accounts.findOneByOrFail({ id });
      if (taken && normalize(current.username) !== normalizedUsername) {
        throw new ConflictException(IDENTIFIER_TAKEN_MESSAGE);
      }
      update.username = changes.username.trim();
      update.normalizedUsername = normalizedUsername;
    }
    await this.saveChanges(id, update);
    return this.accounts.findOneByOrFail({ id });
  }

  /** False when the password is wrong; nothing changes then. */
  async changeEmail(
    id: string,
    password: string,
    email: string,
  ): Promise<boolean> {
    if (!(await this.passwordMatches(id, password))) return false;
    await this.saveChanges(id, {
      email: email.trim(),
      normalizedEmail: normalize(email),
    });
    return true;
  }

  /** False when the current password is wrong; nothing changes then. */
  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    if (!(await this.passwordMatches(id, currentPassword))) return false;
    await this.setPassword(id, newPassword);
    return true;
  }

  async setPassword(id: string, password: string): Promise<void> {
    const passwordHash = await this.passwords.hash(password);
    await this.accounts.update({ id }, { passwordHash });
  }

  /**
   * Deletes the account. Its password resets and provider data (sessions,
   * grants, tokens) go with it through ON DELETE CASCADE.
   */
  async delete(id: string): Promise<void> {
    await this.accounts.delete({ id });
  }

  async passwordMatches(id: string, password: string): Promise<boolean> {
    const account = await this.accounts
      .createQueryBuilder('account')
      .addSelect('account.passwordHash')
      .where('account.id = :id', { id })
      .getOne();
    return this.passwords.verify(password, account?.passwordHash);
  }

  private withPasswordHash(login: string): Promise<Account | null> {
    const normalized = normalize(login);
    const column = normalized.includes('@')
      ? 'account.normalizedEmail'
      : 'account.normalizedUsername';
    return this.accounts
      .createQueryBuilder('account')
      .addSelect('account.passwordHash')
      .where(`${column} = :normalized`, { normalized })
      .getOne();
  }

  private async saveChanges(
    id: string,
    update: Partial<Account>,
  ): Promise<void> {
    const defined = Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(defined).length === 0) return;
    try {
      await this.accounts.update({ id }, defined);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(IDENTIFIER_TAKEN_MESSAGE);
      }
      throw error;
    }
  }
}
