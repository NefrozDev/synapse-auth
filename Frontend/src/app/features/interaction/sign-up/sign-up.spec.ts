import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IdentityApi } from '../../../core/api/identity-api';
import { BROWSER_LOCATION } from '../../../core/browser/browser-location';
import { buttonNamed, linkNamed, query, settle, textOf, typeInto } from '../../../../testing/dom';
import {
  answer,
  failWith,
  fakeApi,
  fakeLocation,
  interactionFor,
} from '../../../../testing/fake-api';
import { SignUp } from './sign-up';

describe('SignUp', () => {
  let api: ReturnType<typeof fakeApi>;
  let location: ReturnType<typeof fakeLocation>;
  let harness: RouterTestingHarness;
  let host: HTMLElement;

  beforeEach(async () => {
    api = fakeApi();
    location = fakeLocation();
    api.interaction.mockReturnValue(answer(interactionFor()));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'interaction/:uid', children: [] },
            { path: 'interaction/:uid/sign-up', component: SignUp },
            { path: 'terms', children: [] },
          ],
          withComponentInputBinding(),
        ),
        { provide: IdentityApi, useValue: api },
        { provide: BROWSER_LOCATION, useValue: location },
      ],
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interaction/uid-1/sign-up');
    host = harness.routeNativeElement!;
    await settle(harness.fixture);
  });

  function fill(values: Partial<Record<string, string>> = {}): void {
    const all = {
      '#sign-up-given-name': ' Jamie ',
      '#sign-up-family-name': 'Doe',
      '#sign-up-username': 'jamie.doe',
      '#sign-up-email': 'jamie@example.test',
      '#sign-up-password': 'correct horse battery',
      ...values,
    };
    for (const [selector, value] of Object.entries(all)) {
      typeInto(host, selector, value ?? '');
    }
  }

  async function acceptAndSubmit(accept = true): Promise<void> {
    const terms = query<HTMLInputElement>(host, 'input[type="checkbox"]');
    if (accept !== terms.checked) {
      terms.click();
    }
    buttonNamed(host, 'Créer mon compte').click();
    await settle(harness.fixture);
  }

  it('should name the app and link back to signing in and to the terms in a new tab', () => {
    expect(textOf(host, 'h1')).toBe('Créer un compte');
    expect(host.textContent).toContain('pour continuer vers Plano');
    expect(linkNamed(host, 'Se connecter').getAttribute('href')).toBe('/interaction/uid-1');
    const terms = linkNamed(host, 'Lire les conditions et la politique de confidentialité');
    expect(terms.getAttribute('href')).toBe('/terms');
    expect(terms.target).toBe('_blank');
  });

  it('should refuse a sign-up without the terms or with invalid fields, and send nothing', async () => {
    fill({ '#sign-up-username': 'a b', '#sign-up-password': 'short', '#sign-up-email': 'nope' });

    await acceptAndSubmit(false);

    const errors = [...host.querySelectorAll('.form-error')].map((e) => e.textContent?.trim());
    expect(errors).toEqual([
      '3 à 30 lettres, chiffres, points, tirets ou tirets bas.',
      'Saisissez une adresse e-mail valide.',
      'Le mot de passe doit contenir au moins 8 caractères.',
      'Acceptez les conditions pour créer un compte.',
    ]);
    expect(api.register).not.toHaveBeenCalled();
  });

  it('should create the account in the page language and hand the browser back', async () => {
    api.register.mockReturnValue(answer({ redirectTo: 'https://auth.example/oidc/auth/uid-1' }));
    fill();

    await acceptAndSubmit();

    expect(api.register).toHaveBeenCalledExactlyOnceWith('uid-1', {
      givenName: 'Jamie',
      familyName: 'Doe',
      username: 'jamie.doe',
      email: 'jamie@example.test',
      password: 'correct horse battery',
      acceptedTerms: true,
      locale: 'fr',
    });
    expect(location.assign).toHaveBeenCalledExactlyOnceWith('https://auth.example/oidc/auth/uid-1');
  });

  it('should say when the username or e-mail is taken', async () => {
    api.register.mockReturnValue(failWith(409));
    fill();

    await acceptAndSubmit();

    expect(textOf(host, '[role="alert"].alert')).toBe(
      "Ce nom d'utilisateur ou cette adresse e-mail est déjà utilisé.",
    );
    expect(location.assign).not.toHaveBeenCalled();
  });
});
