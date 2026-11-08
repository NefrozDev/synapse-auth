import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  effect,
  inject,
  input,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { httpStatus } from '../../core/api/api-errors';
import { type Account, IdentityApi, accountSignInUrl } from '../../core/api/identity-api';
import { BROWSER_LOCATION } from '../../core/browser/browser-location';
import { Language } from '../../core/i18n/language';
import { AccountSessions } from './account-sessions';
import { EmailSection } from './email-section';
import { PasswordSection } from './password-section';
import { ProfileSection } from './profile-section';

/**
 * The account, shared by every Synapse app. Not signed in here: the API's own
 * sign-in runs (the same pages as for an app) and comes back.
 */
@Component({
  selector: 'app-account-page',
  imports: [AccountSessions, EmailSection, PasswordSection, ProfileSection, TranslocoPipe],
  templateUrl: './account-page.html',
  styleUrl: './account-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPage {
  private readonly api = inject(IdentityApi);
  private readonly language = inject(Language);
  private readonly location = inject(BROWSER_LOCATION);

  /** ?signInFailed=1: back from a sign-in that was cancelled or not this browser's. */
  readonly signInFailed = input(false, { transform: booleanAttribute });

  protected readonly account = rxResource<Account, void>({
    stream: () => this.api.account(),
  });

  constructor() {
    effect(() => {
      const error = this.account.error();
      // After a failed sign-in, the person chooses to try again: no redirect loop.
      if (error && httpStatus(error) === 401 && !this.signInFailed()) {
        this.location.assign(this.signInUrl());
      }
    });
    effect(() => {
      if (this.account.hasValue()) {
        void this.language.use(this.account.value().locale);
      }
    });
  }

  protected signInUrl(): string {
    return accountSignInUrl(this.language.current);
  }

  protected signingIn(): boolean {
    return httpStatus(this.account.error()) === 401;
  }

  protected updated(account: Account): void {
    this.account.set(account);
  }
}
