import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';

/** Move it with any change to the `terms` texts. */
export const TERMS_UPDATED_ON = '2026-11-08';
export const CONTACT_EMAIL = 'contact@synapseengineering.dev';
export const DATA_PROTECTION_AUTHORITY_URL = 'https://www.autoriteprotectiondonnees.be';

/** Every section of the terms, in order: each has a title and a text. */
export const TERMS_SECTIONS = [
  'service',
  'account',
  'data',
  'cookies',
  'security',
  'hosting',
  'deletion',
  'rights',
  'law',
] as const;

/** The terms of use and the privacy policy of the shared account. Public. */
@Component({
  selector: 'app-terms',
  imports: [TranslocoPipe],
  templateUrl: './terms.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Terms {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly sections = TERMS_SECTIONS;
  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly authorityUrl = DATA_PROTECTION_AUTHORITY_URL;
  protected readonly updatedOn = computed(() =>
    new Intl.DateTimeFormat(this.lang(), { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(TERMS_UPDATED_ON),
    ),
  );

  /** Back where the person came from in the site, else to the account. */
  protected back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) {
      this.location.back();
    } else {
      void this.router.navigateByUrl('/account');
    }
  }
}
