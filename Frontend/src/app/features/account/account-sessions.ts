import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormField,
  FormRoot,
  type FieldTree,
  type TreeValidationResult,
  form,
  required,
} from '@angular/forms/signals';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { type Observable, firstValueFrom } from 'rxjs';
import { errorField, failureMessage, httpStatus } from '../../core/api/api-errors';
import { IdentityApi } from '../../core/api/identity-api';
import { visibleError } from '../../shared/forms/field-errors';

interface DeletionModel {
  password: string;
}

/** Signing out (here or everywhere) and deleting the account. */
@Component({
  selector: 'app-account-sessions',
  imports: [FormField, FormRoot, TranslocoPipe],
  templateUrl: './account-sessions.html',
  // Two cards: spaced like the page's own.
  styles: ':host { display: flex; flex-direction: column; gap: 20px; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSessions {
  private readonly api = inject(IdentityApi);
  private readonly router = inject(Router);

  protected readonly visibleError = visibleError;
  protected readonly busy = signal(false);
  protected readonly signOutError = signal<string | null>(null);
  protected readonly deleteError = signal<string | null>(null);

  private readonly model = signal<DeletionModel>({ password: '' });

  protected readonly form = form(
    this.model,
    (path) => required(path.password, { message: 'errors.required' }),
    { submission: { action: (root) => this.delete(root) } },
  );

  protected signOut(): Promise<void> {
    return this.leave(this.api.signOut());
  }

  protected signOutEverywhere(): Promise<void> {
    return this.leave(this.api.signOutEverywhere());
  }

  private async leave(call: Observable<void>): Promise<void> {
    this.busy.set(true);
    this.signOutError.set(null);
    try {
      await firstValueFrom(call);
      await this.router.navigateByUrl('/signed-out');
    } catch (error) {
      this.signOutError.set(failureMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async delete(root: FieldTree<DeletionModel>): Promise<TreeValidationResult> {
    this.deleteError.set(null);
    try {
      await firstValueFrom(this.api.deleteAccount(this.model().password));
    } catch (error) {
      if (httpStatus(error) === 400 && errorField(error) === 'password') {
        return { kind: 'wrongPassword', message: 'errors.wrongPassword', fieldTree: root.password };
      }
      this.deleteError.set(failureMessage(error));
      return null;
    }
    await this.router.navigate(['/signed-out'], { queryParams: { deleted: 1 } });
    return null;
  }
}
