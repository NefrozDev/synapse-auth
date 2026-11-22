import { Location, ViewportScroller } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';

/** Move it with any change to the `terms` texts. */
export const TERMS_UPDATED_ON = '2026-11-22';
export const CONTACT_EMAIL = 'contact@synapseengineering.dev';
export const DATA_PROTECTION_AUTHORITY_URL = 'https://www.autoriteprotectiondonnees.be';
export const CONSUMER_MEDIATION_URL = 'https://mediationconsommateur.be';

/** The publisher's legal details (Belgian Code of Economic Law, art. XII.6; GDPR, art. 13). */
export const PUBLISHER = {
  name: 'Synapse Engineering SRL',
  street: 'Rue Rogier 52',
  city: '5000 Namur',
  enterpriseNumber: 'BE 1041.811.474',
} as const;

/**
 * A piece of a section, rendered in order. `p` and `list` name keys under the section;
 * `publisher`, `mediation` and `authority` render the matching details with their links.
 */
export type TermsBlock =
  | { readonly kind: 'p'; readonly key: string }
  | { readonly kind: 'list'; readonly key: string; readonly items: readonly string[] }
  | { readonly kind: 'publisher' | 'mediation' | 'authority' };

export interface TermsSection {
  /** Also the anchor other apps link to, e.g. `/terms#reports`. */
  readonly id: string;
  readonly blocks: readonly TermsBlock[];
}

export interface TermsPart {
  readonly id: 'conditions' | 'privacy';
  readonly sections: readonly TermsSection[];
}

const p = (key: string): TermsBlock => ({ kind: 'p', key });
const list = (...items: string[]): TermsBlock => ({ kind: 'list', key: 'list', items });

/**
 * The terms of use, then the privacy policy, shared by every Synapse Engineering app. Section
 * ids are unique across both parts: they are the page's anchors.
 */
export const TERMS_PARTS: readonly TermsPart[] = [
  {
    id: 'conditions',
    sections: [
      {
        id: 'publisher',
        blocks: [
          p('intro'),
          { kind: 'publisher' },
          p('services'),
          list('account', 'plano', 'erudi', 'semverSage', 'portfolio'),
          p('scope'),
        ],
      },
      { id: 'acceptance', blocks: [p('account'), p('anonymous'), p('refusal')] },
      { id: 'eligibility', blocks: [p('age'), p('underage')] },
      {
        id: 'account',
        blocks: [
          p('intro'),
          list('accurate', 'personal', 'password', 'report'),
          p('responsibility'),
          p('username'),
        ],
      },
      {
        id: 'conduct',
        blocks: [
          p('intro'),
          list('illegal', 'copyright', 'impersonate', 'spam', 'access', 'automate', 'disrupt'),
          p('vulnerabilities'),
        ],
      },
      {
        id: 'content',
        blocks: [p('ownership'), p('licence'), p('publication'), p('warranty'), p('noReview')],
      },
      { id: 'ai', blocks: [p('generation'), p('verify'), p('sources')] },
      { id: 'reports', blocks: [p('how'), p('content'), p('decision'), p('anonymity')] },
      { id: 'ip', blocks: [p('ownership'), p('licence')] },
      { id: 'availability', blocks: [p('free'), p('availability'), p('evolution')] },
      { id: 'liability', blocks: [p('limits'), p('exceptions'), p('user')] },
      { id: 'termination', blocks: [p('user'), p('breach')] },
      { id: 'changes', blocks: [p('right'), p('notice')] },
      { id: 'law', blocks: [p('law'), p('amicable'), { kind: 'mediation' }, p('courts')] },
      { id: 'language', blocks: [p('language'), p('severability'), p('contact')] },
    ],
  },
  {
    id: 'privacy',
    sections: [
      { id: 'controller', blocks: [p('controller'), p('dpo')] },
      {
        id: 'data',
        blocks: [
          p('intro'),
          list('account', 'plano', 'erudi', 'semverSage', 'portfolio', 'technical'),
          p('required'),
          p('sensitive'),
        ],
      },
      {
        id: 'purposes',
        blocks: [
          p('intro'),
          list('service', 'email', 'security', 'contact', 'legal'),
          p('commitments'),
        ],
      },
      {
        id: 'recipients',
        blocks: [
          p('apps'),
          p('users'),
          p('processors'),
          list('ovh', 'vercel', 'neon', 'resend'),
          p('authorities'),
        ],
      },
      { id: 'transfers', blocks: [p('eu'), p('us')] },
      {
        id: 'retention',
        blocks: [
          list('account', 'sessions', 'questions', 'copies', 'notices', 'contact', 'ip', 'backups'),
          p('litigation'),
        ],
      },
      {
        id: 'cookies',
        blocks: [
          p('necessary'),
          list('account', 'plano', 'erudi', 'semverSage', 'portfolio'),
          p('control'),
        ],
      },
      { id: 'security', blocks: [p('measures'), p('breach')] },
      { id: 'deletion', blocks: [p('how'), p('backups')] },
      {
        id: 'rights',
        blocks: [
          p('intro'),
          list('access', 'rectification', 'erasure', 'restriction', 'portability', 'objection'),
          p('exercise'),
          p('complaint'),
          { kind: 'authority' },
        ],
      },
      { id: 'minors', blocks: [p('text')] },
      { id: 'updates', blocks: [p('text')] },
    ],
  },
];

/** The terms of use and the privacy policy of every Synapse Engineering app. Public. */
@Component({
  selector: 'app-terms',
  imports: [TranslocoPipe, RouterLink],
  templateUrl: './terms.html',
  styleUrl: './terms.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Terms {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly parts = TERMS_PARTS;
  protected readonly publisher = PUBLISHER;
  protected readonly params = { email: CONTACT_EMAIL, number: PUBLISHER.enterpriseNumber };
  protected readonly contactEmail = CONTACT_EMAIL;
  protected readonly authorityUrl = DATA_PROTECTION_AUTHORITY_URL;
  protected readonly mediationUrl = CONSUMER_MEDIATION_URL;
  protected readonly updatedOn = computed(() =>
    new Intl.DateTimeFormat(this.lang(), { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(TERMS_UPDATED_ON),
    ),
  );

  constructor() {
    // Arriving from another app at `/terms#privacy`: the router scrolls before the texts have
    // loaded, while the page is still short, so scroll again once they are on screen.
    const fragment = inject(ActivatedRoute).snapshot.fragment;
    if (fragment) {
      const scroller = inject(ViewportScroller);
      const injector = inject(Injector);
      this.transloco
        .selectTranslation()
        .pipe(take(1), takeUntilDestroyed())
        .subscribe(() =>
          afterNextRender({ read: () => scroller.scrollToAnchor(fragment) }, { injector }),
        );
    }
  }

  /** Back where the person came from in the site, else to the account. */
  protected back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) {
      this.location.back();
    } else {
      void this.router.navigateByUrl('/account');
    }
  }
}
