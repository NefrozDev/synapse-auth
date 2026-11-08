import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormField, FormRoot, form, maxLength, pattern, required } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { failureMessage, httpStatus } from '../../core/api/api-errors';
import { type Account, IdentityApi } from '../../core/api/identity-api';
import { visibleError } from '../../shared/forms/field-errors';
import { ACCOUNT_LANGUAGES, NAME_MAX_LENGTH, USERNAME_PATTERN } from '../account-rules';

interface ProfileModel {
  givenName: string;
  familyName: string;
  username: string;
  locale: string;
}

/** Name, username and language. */
@Component({
  selector: 'app-profile-section',
  imports: [FormField, FormRoot, TranslocoPipe],
  templateUrl: './profile-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSection {
  private readonly api = inject(IdentityApi);

  readonly account = input.required<Account>();
  readonly updated = output<Account>();

  protected readonly languages = ACCOUNT_LANGUAGES;
  protected readonly visibleError = visibleError;
  protected readonly formError = signal<string | null>(null);
  protected readonly saved = signal(false);

  private readonly model = signal<ProfileModel>({
    givenName: '',
    familyName: '',
    username: '',
    locale: 'fr',
  });

  protected readonly form = form(
    this.model,
    (path) => {
      for (const name of [path.givenName, path.familyName]) {
        required(name, { message: 'errors.required' });
        maxLength(name, NAME_MAX_LENGTH, { message: 'errors.nameTooLong' });
      }
      required(path.username, { message: 'errors.required' });
      pattern(path.username, USERNAME_PATTERN, { message: 'errors.usernameFormat' });
    },
    { submission: { action: () => this.submit() } },
  );

  constructor() {
    // The form starts from the account, and follows it after each save.
    effect(() => {
      const { givenName, familyName, username, locale } = this.account();
      this.model.set({ givenName, familyName, username, locale });
    });
  }

  private async submit(): Promise<void> {
    this.formError.set(null);
    this.saved.set(false);
    const values = this.model();
    try {
      const account = await firstValueFrom(
        this.api.updateProfile({
          givenName: values.givenName.trim(),
          familyName: values.familyName.trim(),
          username: values.username.trim(),
          locale: values.locale,
        }),
      );
      this.saved.set(true);
      this.updated.emit(account);
    } catch (error) {
      this.formError.set(httpStatus(error) === 409 ? 'errors.taken' : failureMessage(error));
    }
  }
}
