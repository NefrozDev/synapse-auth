import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Shown once a sign-in is over: only the app can start a new one. */
@Component({
  selector: 'app-interaction-expired',
  imports: [RouterLink, TranslocoPipe],
  template: `
    <section class="card" role="alert">
      <h1 class="title">{{ 'interaction.expiredTitle' | transloco }}</h1>
      <p class="subtitle">{{ 'interaction.expiredText' | transloco }}</p>
      <a class="button button--secondary" routerLink="/account">{{
        'interaction.toAccount' | transloco
      }}</a>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InteractionExpired {}
