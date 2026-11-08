import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormField,
  FormRoot,
  type FieldTree,
  type TreeValidationResult,
  form,
  maxLength,
  minLength,
  required,
} from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorField, failureMessage, httpStatus } from '../../core/api/api-errors';
import { IdentityApi } from '../../core/api/identity-api';
import { visibleError } from '../../shared/forms/field-errors';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../account-rules';

/** A new password; this device stays signed in, the others are signed out. */
@Component({
  selector: 'app-password-section',
  imports: [FormField, FormRoot, TranslocoPipe],
  templateUrl: './password-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordSection {
  private readonly api = inject(IdentityApi);

  protected readonly visibleError = visibleError;
  protected readonly formError = signal<string | null>(null);
  protected readonly changed = signal(false);

  private readonly model = signal({ currentPassword: '', newPassword: '' });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.currentPassword, { message: 'errors.required' });
      required(path.newPassword, { message: 'errors.required' });
      minLength(path.newPassword, PASSWORD_MIN_LENGTH, { message: 'errors.passwordLength' });
      maxLength(path.newPassword, PASSWORD_MAX_LENGTH, { message: 'errors.passwordTooLong' });
    },
    { submission: { action: (root) => this.submit(root) } },
  );

  private async submit(
    root: FieldTree<{ currentPassword: string; newPassword: string }>,
  ): Promise<TreeValidationResult> {
    this.formError.set(null);
    this.changed.set(false);
    const { currentPassword, newPassword } = this.model();
    try {
      await firstValueFrom(this.api.changePassword(currentPassword, newPassword));
      this.model.set({ currentPassword: '', newPassword: '' });
      this.form().reset();
      this.changed.set(true);
      return null;
    } catch (error) {
      if (httpStatus(error) === 400 && errorField(error) === 'currentPassword') {
        return {
          kind: 'wrongPassword',
          message: 'errors.wrongPassword',
          fieldTree: root.currentPassword,
        };
      }
      this.formError.set(failureMessage(error));
      return null;
    }
  }
}
