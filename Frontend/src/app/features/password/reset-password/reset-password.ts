import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormField, FormRoot, form, maxLength, minLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../../core/api/api-errors';
import { IdentityApi } from '../../../core/api/identity-api';
import { visibleError } from '../../../shared/forms/field-errors';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, RESET_TOKEN_PATTERN } from '../../account-rules';

type ResetStep = 'form' | 'done' | 'invalid';

/** Opened from the e-mailed link, whose fragment carries the token: `#token=…`. */
@Component({
  selector: 'app-reset-password',
  imports: [FormField, FormRoot, RouterLink, TranslocoPipe],
  templateUrl: './reset-password.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPassword implements OnInit {
  private readonly api = inject(IdentityApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private token = '';

  protected readonly step = signal<ResetStep>('form');
  protected readonly formError = signal<string | null>(null);
  protected readonly visibleError = visibleError;

  private readonly model = signal({ password: '' });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.password, { message: 'errors.required' });
      minLength(path.password, PASSWORD_MIN_LENGTH, { message: 'errors.passwordLength' });
      maxLength(path.password, PASSWORD_MAX_LENGTH, { message: 'errors.passwordTooLong' });
    },
    { submission: { action: () => this.submit() } },
  );

  ngOnInit(): void {
    const fragment = this.route.snapshot.fragment ?? '';
    this.token = new URLSearchParams(fragment).get('token') ?? '';
    if (!RESET_TOKEN_PATTERN.test(this.token)) {
      this.step.set('invalid');
      return;
    }
    // Keeps the token out of the address bar and the browser history once read.
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true });
  }

  private async submit(): Promise<void> {
    this.formError.set(null);
    try {
      await firstValueFrom(this.api.confirmPasswordReset(this.token, this.model().password));
      this.step.set('done');
    } catch (error) {
      const status = httpStatus(error);
      if (status === 400) {
        this.step.set('invalid');
      } else {
        this.formError.set(status === 429 ? 'errors.tooManyAttempts' : 'errors.generic');
      }
    }
  }
}
