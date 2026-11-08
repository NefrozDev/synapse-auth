import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import {
  FormField,
  FormRoot,
  type FieldTree,
  type TreeValidationResult,
  email,
  form,
  required,
} from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { errorField, failureMessage, httpStatus } from '../../core/api/api-errors';
import { type Account, IdentityApi } from '../../core/api/identity-api';
import { visibleError } from '../../shared/forms/field-errors';

/** A new e-mail address, confirmed with the password. */
@Component({
  selector: 'app-email-section',
  imports: [FormField, FormRoot, TranslocoPipe],
  templateUrl: './email-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailSection {
  private readonly api = inject(IdentityApi);

  readonly account = input.required<Account>();
  readonly updated = output<Account>();

  protected readonly visibleError = visibleError;
  protected readonly formError = signal<string | null>(null);
  protected readonly changed = signal(false);

  private readonly model = signal({ email: '', password: '' });

  protected readonly form = form(
    this.model,
    (path) => {
      required(path.email, { message: 'errors.required' });
      email(path.email, { message: 'errors.email' });
      required(path.password, { message: 'errors.required' });
    },
    { submission: { action: (root) => this.submit(root) } },
  );

  private async submit(
    root: FieldTree<{ email: string; password: string }>,
  ): Promise<TreeValidationResult> {
    this.formError.set(null);
    this.changed.set(false);
    const { email: address, password } = this.model();
    try {
      const account = await firstValueFrom(this.api.changeEmail(address, password));
      this.model.set({ email: '', password: '' });
      this.form().reset();
      this.changed.set(true);
      this.updated.emit(account);
      return null;
    } catch (error) {
      // A wrong password belongs to its field; the form can be sent again once it changes.
      if (httpStatus(error) === 400 && errorField(error) === 'password') {
        return { kind: 'wrongPassword', message: 'errors.wrongPassword', fieldTree: root.password };
      }
      this.formError.set(httpStatus(error) === 409 ? 'errors.taken' : failureMessage(error));
      return null;
    }
  }
}
