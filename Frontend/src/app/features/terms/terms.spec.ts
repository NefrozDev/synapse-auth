import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buttonNamed, settle, textOf } from '../../../testing/dom';
import { SignedOut } from '../signed-out/signed-out';
import { CONTACT_EMAIL, TERMS_SECTIONS, Terms } from './terms';
import { withComponentInputBinding } from '@angular/router';

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

  it('should state the facts the service keeps to, with the date and the contact', async () => {
    await harness.navigateByUrl('/terms');
    const host = harness.routeNativeElement!;

    expect(textOf(host, 'h1')).toBe("Conditions d'utilisation et confidentialité");
    expect(textOf(host, 'header .subtitle')).toBe('Dernière mise à jour : 8 novembre 2026');
    expect(host.querySelectorAll('article section')).toHaveLength(TERMS_SECTIONS.length);
    const text = host.textContent ?? '';
    for (const fact of [
      '30 jours au plus',
      'valable 30 minutes',
      '14 jours au plus',
      'OVHcloud',
      'Aucun traceur',
      'chaque application est prévenue',
    ]) {
      expect(text).toContain(fact);
    }
    expect(host.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`)).not.toBeNull();
  });

  it('should go back to the account when the terms were opened on their own', async () => {
    await harness.navigateByUrl('/terms');

    buttonNamed(harness.routeNativeElement!, '← Retour').click();
    await settle(harness.fixture);

    expect(TestBed.inject(Router).url).toBe('/account');
  });

  it('should say the person is signed out, or that the account is deleted', async () => {
    await harness.navigateByUrl('/signed-out');
    expect(textOf(harness.routeNativeElement!, 'h1')).toBe('Vous êtes déconnecté');

    await harness.navigateByUrl('/signed-out?deleted=1');
    expect(textOf(harness.routeNativeElement!, 'h1')).toBe('Votre compte est supprimé');
  });
});
