import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { failureMessage } from '../../../core/api/api-errors';
import { IdentityApi } from '../../../core/api/identity-api';
import { visibleError } from '../../../shared/forms/field-errors';

/**
 * Asks for a reset link. The answer never says whether the address has an
 * account, so the page always shows the same confirmation.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [FormField, FormRoot, RouterLink, TranslocoPipe],
  templateUrl: './forgot-password.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPassword {
  private readonly api = inject(IdentityApi);

  /** ?return= the sign-in page to go back to; only a path on this site. */
  readonly return = input<string>();

  protected readonly backLink = computed(() => {
    const path = this.return();
    return path?.startsWith('/interaction/') ? path : '/account';
  });
  protected readonly visibleError = visibleError;
  protected readonly sent = signal(false);
  protected readonly formError = signal<string | null>(null);

  private readonly model = signal({ email: '' });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.email, { message: 'errors.required' });
      email(path.email, { message: 'errors.email' });
    },
    { submission: { action: () => this.submit() } },
  );

  private async submit(): Promise<void> {
    this.formError.set(null);
    try {
      await firstValueFrom(this.api.requestPasswordReset(this.model().email));
      this.sent.set(true);
    } catch (error) {
      this.formError.set(failureMessage(error));
    }
  }
}
