import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  FormField,
  FormRoot,
  email,
  form,
  maxLength,
  minLength,
  pattern,
  required,
  validate,
} from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../../core/api/api-errors';
import { IdentityApi } from '../../../core/api/identity-api';
import { BROWSER_LOCATION } from '../../../core/browser/browser-location';
import { Language } from '../../../core/i18n/language';
import { visibleError } from '../../../shared/forms/field-errors';
import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
} from '../../account-rules';
import { InteractionExpired } from '../interaction-expired';
import { explainFailure, interactionResource, isExpired } from '../interaction-resource';

interface SignUpModel {
  givenName: string;
  familyName: string;
  username: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

/** Creating an account while signing in for an app; it comes back signed in. */
@Component({
  selector: 'app-sign-up',
  imports: [FormField, FormRoot, InteractionExpired, RouterLink, TranslocoPipe],
  templateUrl: './sign-up.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignUp {
  private readonly api = inject(IdentityApi);
  private readonly location = inject(BROWSER_LOCATION);
  private readonly language = inject(Language);

  /** From the route: /interaction/:uid/sign-up. */
  readonly uid = input.required<string>();

  protected readonly details = interactionResource(this.uid);
  protected readonly isExpired = isExpired;
  protected readonly visibleError = visibleError;
  protected readonly formError = signal<string | null>(null);
  protected readonly expired = signal(false);
  protected readonly leaving = signal(false);

  private readonly model = signal<SignUpModel>({
    givenName: '',
    familyName: '',
    username: '',
    email: '',
    password: '',
    acceptedTerms: false,
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
      required(path.email, { message: 'errors.required' });
      email(path.email, { message: 'errors.email' });
      required(path.password, { message: 'errors.required' });
      minLength(path.password, PASSWORD_MIN_LENGTH, { message: 'errors.passwordLength' });
      maxLength(path.password, PASSWORD_MAX_LENGTH, { message: 'errors.passwordTooLong' });
      validate(path.acceptedTerms, ({ value }) =>
        value() ? null : { kind: 'terms', message: 'errors.acceptTerms' },
      );
    },
    { submission: { action: () => this.submit() } },
  );

  private async submit(): Promise<void> {
    this.formError.set(null);
    const values = this.model();
    try {
      const { redirectTo } = await firstValueFrom(
        this.api.register(this.uid(), {
          ...values,
          givenName: values.givenName.trim(),
          familyName: values.familyName.trim(),
          username: values.username.trim(),
          // The page's language becomes the account's, as the person read it.
          locale: this.language.current,
        }),
      );
      this.leaving.set(true);
      this.location.assign(redirectTo);
    } catch (error) {
      if (isExpired(error)) {
        this.expired.set(true);
      } else if (httpStatus(error) === 409) {
        this.formError.set('errors.taken');
      } else {
        this.formError.set(explainFailure(error));
      }
    }
  }
}
