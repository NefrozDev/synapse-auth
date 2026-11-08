import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormField, FormRoot, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../../core/api/api-errors';
import { IdentityApi } from '../../../core/api/identity-api';
import { BROWSER_LOCATION } from '../../../core/browser/browser-location';
import { visibleError } from '../../../shared/forms/field-errors';
import { explainFailure, interactionResource, isExpired } from '../interaction-resource';
import { InteractionExpired } from '../interaction-expired';

interface SignInModel {
  login: string;
  password: string;
}

/** Signing in for an app: the page the provider sends browsers to. */
@Component({
  selector: 'app-sign-in',
  imports: [FormField, FormRoot, InteractionExpired, RouterLink, TranslocoPipe],
  templateUrl: './sign-in.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignIn {
  private readonly api = inject(IdentityApi);
  private readonly location = inject(BROWSER_LOCATION);

  /** From the route: /interaction/:uid. */
  readonly uid = input.required<string>();

  protected readonly details = interactionResource(this.uid);
  protected readonly isExpired = isExpired;
  protected readonly visibleError = visibleError;
  protected readonly formError = signal<string | null>(null);
  protected readonly expired = signal(false);
  protected readonly leaving = signal(false);

  private readonly model = signal<SignInModel>({ login: '', password: '' });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.login, { message: 'errors.required' });
      required(path.password, { message: 'errors.required' });
    },
    { submission: { action: () => this.submit() } },
  );

  constructor() {
    // An app may say who is expected (login_hint): saves typing it.
    effect(() => {
      const hint = this.details.hasValue() ? this.details.value().loginHint : null;
      if (hint && !this.model().login) {
        this.model.update((model) => ({ ...model, login: hint }));
      }
    });
  }

  protected async backToApp(): Promise<void> {
    this.leaving.set(true);
    try {
      const { redirectTo } = await firstValueFrom(this.api.abort(this.uid()));
      this.location.assign(redirectTo);
    } catch (error) {
      this.leaving.set(false);
      this.fail(error);
    }
  }

  private async submit(): Promise<void> {
    this.formError.set(null);
    try {
      const { login, password } = this.model();
      const { redirectTo } = await firstValueFrom(
        this.api.signIn(this.uid(), login.trim(), password),
      );
      this.leaving.set(true);
      this.location.assign(redirectTo);
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    if (isExpired(error)) {
      this.expired.set(true);
    } else if (httpStatus(error) === 401) {
      this.formError.set('signIn.invalid');
    } else {
      this.formError.set(explainFailure(error));
    }
  }
}
