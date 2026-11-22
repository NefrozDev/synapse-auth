import { Location, ViewportScroller } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import { buttonNamed, settle, textOf } from '../../../testing/dom';
import { SignedOut } from '../signed-out/signed-out';
import {
  CONSUMER_MEDIATION_URL,
  CONTACT_EMAIL,
  DATA_PROTECTION_AUTHORITY_URL,
  PUBLISHER,
  TERMS_PARTS,
  TermsBlock,
  Terms,
} from './terms';

/** Every translation key the page reads, from its structure. */
function termsKeys(): string[] {
  return [
    'title',
    'updated',
    'intro',
    'contents',
    'back',
    ...TERMS_PARTS.flatMap((part) => [
      `${part.id}.title`,
      ...part.sections.flatMap((section) => {
        const prefix = `${part.id}.${section.id}.`;
        const blockKeys = (block: TermsBlock): string[] => {
          switch (block.kind) {
            case 'p':
              return [block.key];
            case 'list':
              return block.items.map((item) => `${block.key}.${item}`);
            case 'publisher':
              return ['country', 'company'];
            default:
              return [block.kind];
          }
        };
        return [`${prefix}title`, ...section.blocks.flatMap(blockKeys).map((k) => prefix + k)];
      }),
    ]),
  ];
}

function lookUp(texts: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], texts);
}

describe('Terms and SignedOut', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'terms', component: Terms },
            { path: 'signed-out', component: SignedOut },
            { path: 'account', children: [] },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('should have every text it reads in French and in English, and nothing else', () => {
    const keys = termsKeys();
    for (const texts of [fr.terms, en.terms]) {
      const missing = keys.filter((key) => typeof lookUp(texts, key) !== 'string');
      expect(missing).toEqual([]);
    }
    // No orphan text: a key in the files but not on the page would be a stale promise.
    const leaves = (node: object, prefix = ''): string[] =>
      Object.entries(node).flatMap(([key, value]) =>
        typeof value === 'object' && value !== null
          ? leaves(value as object, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );
    expect(leaves(fr.terms).sort()).toEqual([...new Set(keys)].sort());
    expect(leaves(en.terms).sort()).toEqual(leaves(fr.terms).sort());
  });

  it('should keep every section id unique, since they are the anchors other apps link to', () => {
    const ids = TERMS_PARTS.flatMap((part) => [part.id, ...part.sections.map(({ id }) => id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should show both parts with numbered sections, the date and the publisher', async () => {
    await harness.navigateByUrl('/terms');
    const host = harness.routeNativeElement!;

    expect(textOf(host, 'h1')).toBe(
      "Conditions générales d'utilisation et politique de confidentialité",
    );
    expect(textOf(host, 'header .subtitle')).toBe('Dernière mise à jour : 22 novembre 2026');
    expect(
      [...host.querySelectorAll('.terms__part-title')].map((h) => h.textContent?.trim()),
    ).toEqual(["Conditions générales d'utilisation", 'Politique de confidentialité']);
    for (const part of TERMS_PARTS) {
      const titles = [...host.querySelectorAll(`#${part.id} h3`)].map((h) => h.textContent?.trim());
      expect(titles).toHaveLength(part.sections.length);
      titles.forEach((title, index) => expect(title?.startsWith(`${index + 1}. `)).toBe(true));
    }
    expect(textOf(host, '#publisher h3')).toBe('1. Éditeur et objet');
    expect(textOf(host, '#controller h3')).toBe('1. Responsable du traitement');

    const address = textOf(host, 'address').replaceAll(/\s+/g, ' ');
    for (const detail of [
      PUBLISHER.name,
      `${PUBLISHER.street}, ${PUBLISHER.city}, Belgique`,
      "Numéro d'entreprise : BE 1041.811.474 (RPM Liège, division Namur)",
      CONTACT_EMAIL,
    ]) {
      expect(address).toContain(detail);
    }
    expect(host.textContent).not.toContain('{{');
  });

  it('should state the facts the services keep to', async () => {
    await harness.navigateByUrl('/terms');
    const text = harness.routeNativeElement!.textContent ?? '';

    for (const fact of [
      'au moins 13 ans',
      'session (30 jours au plus)',
      'lien de réinitialisation du mot de passe : 30 minutes',
      'conservées 14 jours au plus',
      'OVH SAS (France)',
      "Aucun cookie de mesure d'audience",
      'chaque application est avertie',
      'Google Fonts',
      "tribunaux de l'arrondissement judiciaire de Namur",
      'la version française prévaut',
      'règlement (UE) 2022/2065',
    ]) {
      expect(text).toContain(fact);
    }
  });

  it('should link the contents to each section, and open outside links in a new tab', async () => {
    await harness.navigateByUrl('/terms');
    const host = harness.routeNativeElement!;

    const hrefs = [...host.querySelectorAll<HTMLAnchorElement>('nav a')].map((a) =>
      a.getAttribute('href'),
    );
    const ids = TERMS_PARTS.flatMap((part) => [part.id, ...part.sections.map(({ id }) => id)]);
    expect(hrefs).toEqual(ids.map((id) => `/terms#${id}`));
    for (const id of ids) {
      expect(host.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    }

    for (const url of [DATA_PROTECTION_AUTHORITY_URL, CONSUMER_MEDIATION_URL]) {
      const link = host.querySelector<HTMLAnchorElement>(`a[href="${url}"]`);
      expect(link?.target).toBe('_blank');
      expect(link?.rel).toBe('noopener');
    }
    expect(host.querySelectorAll(`a[href="mailto:${CONTACT_EMAIL}"]`)).toHaveLength(2);
  });

  it('should scroll to the section named in the address once the texts are on screen', async () => {
    const scrollToAnchor = vi.spyOn(TestBed.inject(ViewportScroller), 'scrollToAnchor');

    await harness.navigateByUrl('/terms#rights');
    await settle(harness.fixture);

    expect(scrollToAnchor).toHaveBeenCalledWith('rights');
    expect(harness.routeNativeElement!.querySelector('#rights h3')?.textContent).toContain(
      'Vos droits',
    );
  });

  it('should not scroll anywhere when the address names no section', async () => {
    const scrollToAnchor = vi.spyOn(TestBed.inject(ViewportScroller), 'scrollToAnchor');

    await harness.navigateByUrl('/terms');
    await settle(harness.fixture);

    expect(scrollToAnchor).not.toHaveBeenCalled();
  });

  it('should read in English when the language changes', async () => {
    await harness.navigateByUrl('/terms');
    TestBed.inject(TranslocoService).setActiveLang('en');
    await settle(harness.fixture);
    const host = harness.routeNativeElement!;

    expect(textOf(host, 'h1')).toBe('Terms of use and privacy policy');
    expect(textOf(host, 'header .subtitle')).toBe('Last updated: November 22, 2026');
    expect(textOf(host, '#rights h3')).toBe('10. Your rights');
  });

  it('should go back to the account when the terms were opened on their own', async () => {
    await harness.navigateByUrl('/terms');

    buttonNamed(harness.routeNativeElement!, '← Retour').click();
    await settle(harness.fixture);

    expect(TestBed.inject(Router).url).toBe('/account');
  });

  it('should go back to the previous page of the site when there is one', async () => {
    await harness.navigateByUrl('/signed-out');
    await harness.navigateByUrl('/terms');
    // The browser's history does the going back; the page only asks for it.
    const back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);

    buttonNamed(harness.routeNativeElement!, '← Retour').click();
    await settle(harness.fixture);

    expect(back).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe('/terms');
  });

  it('should say the person is signed out, or that the account is deleted', async () => {
    await harness.navigateByUrl('/signed-out');
    expect(textOf(harness.routeNativeElement!, 'h1')).toBe('Vous êtes déconnecté');

    await harness.navigateByUrl('/signed-out?deleted=1');
    expect(textOf(harness.routeNativeElement!, 'h1')).toBe('Votre compte est supprimé');
  });
});
