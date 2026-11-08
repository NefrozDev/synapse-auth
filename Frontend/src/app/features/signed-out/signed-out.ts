import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** After signing out, or once the account is deleted (?deleted=1). */
@Component({
  selector: 'app-signed-out',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <main class="page">
      <section class="card" role="status">
        @if (deleted()) {
          <h1 class="title">{{ 'signedOut.deletedTitle' | transloco }}</h1>
          <p class="subtitle">{{ 'signedOut.deletedText' | transloco }}</p>
        } @else {
          <h1 class="title">{{ 'signedOut.title' | transloco }}</h1>
          <p class="subtitle">{{ 'signedOut.text' | transloco }}</p>
          <a class="button" routerLink="/account">{{ 'signedOut.signIn' | transloco }}</a>
        }
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignedOut {
  readonly deleted = input(false, { transform: booleanAttribute });
}
