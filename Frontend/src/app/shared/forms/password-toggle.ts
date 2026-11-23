import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Shows or hides the password typed in `input`, placed right after it in a `.password-field`.
 * The button's text says what it will do (GOV.UK pattern) and a hidden live region announces the
 * new state, since screen readers do not reliably read a focused button's renamed label.
 */
@Component({
  selector: 'app-password-toggle',
  imports: [TranslocoPipe],
  template: `
    <button
      class="button button--secondary password-toggle"
      type="button"
      [attr.aria-controls]="input().id || null"
      [attr.aria-label]="(shown() ? 'password.hideLabel' : 'password.showLabel') | transloco"
      (click)="setShown(!shown())"
    >
      {{ (shown() ? 'password.hide' : 'password.show') | transloco }}
    </button>
    <span class="visually-hidden" aria-live="polite">
      @if (announcement(); as key) {
        {{ key | transloco }}
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordToggle {
  readonly input = input.required<HTMLInputElement>();

  protected readonly shown = signal(false);
  protected readonly announcement = signal<string | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Hidden again on submit, so password managers see a password field and a shown password
    // does not stay on screen once it has been sent.
    afterNextRender(() => {
      const form = this.input().form;
      if (!form) {
        return;
      }
      const hide = (): void => {
        if (this.shown()) {
          this.setShown(false);
        }
      };
      form.addEventListener('submit', hide);
      destroyRef.onDestroy(() => form.removeEventListener('submit', hide));
    });
  }

  protected setShown(shown: boolean): void {
    // Set at once rather than in an effect, so a submit sees the field as a password already.
    this.input().type = shown ? 'text' : 'password';
    this.shown.set(shown);
    this.announcement.set(shown ? 'password.shown' : 'password.hidden');
  }
}
