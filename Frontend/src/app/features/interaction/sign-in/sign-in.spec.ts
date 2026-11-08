import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IdentityApi } from '../../../core/api/identity-api';
import { BROWSER_LOCATION } from '../../../core/browser/browser-location';
import { buttonNamed, linkNamed, settle, textOf, typeInto } from '../../../../testing/dom';
import {
  answer,
  failWith,
  fakeApi,
  fakeLocation,
  interactionFor,
} from '../../../../testing/fake-api';
import { SignIn } from './sign-in';

describe('SignIn', () => {
  let api: ReturnType<typeof fakeApi>;
  let location: ReturnType<typeof fakeLocation>;
  let harness: RouterTestingHarness;
  let host: HTMLElement;

  /** The real route, so links resolve as in the site. */
  async function open(details = interactionFor()): Promise<void> {
    api.interaction.mockReturnValue(answer(details));
    await visit();
  }

  async function visit(): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/interaction/uid-1');
    host = harness.routeNativeElement!;
    await settle(harness.fixture);
  }

  async function submitWith(login: string, password: string): Promise<void> {
    typeInto(host, '#sign-in-login', login);
    typeInto(host, '#sign-in-password', password);
    buttonNamed(host, 'Se connecter').click();
    await settle(harness.fixture);
  }

  beforeEach(() => {
    api = fakeApi();
    location = fakeLocation();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'interaction/:uid', component: SignIn },
            { path: 'interaction/:uid/sign-up', children: [] },
            { path: 'forgot-password', children: [] },
            { path: 'account', children: [] },
          ],
          withComponentInputBinding(),
        ),
        { provide: IdentityApi, useValue: api },
        { provide: BROWSER_LOCATION, useValue: location },
      ],
    });
  });

  it('should load the sign-in the app started and name the app', async () => {
    await open();

    expect(api.interaction).toHaveBeenCalledExactlyOnceWith('uid-1');
    expect(textOf(host, 'h1')).toBe('Connexion');
    expect(host.textContent).toContain('pour continuer vers Plano');
    expect(linkNamed(host, 'Créer un compte').getAttribute('href')).toBe(
      '/interaction/uid-1/sign-up',
    );
    expect(linkNamed(host, 'Mot de passe oublié ?').getAttribute('href')).toBe(
      '/forgot-password?return=%2Finteraction%2Fuid-1',
    );
  });

  it('should require both fields and send nothing', async () => {
    await open();

    await submitWith('', '');

    expect(textOf(host, '#sign-in-login-error')).toBe('Ce champ est obligatoire.');
    expect(textOf(host, '#sign-in-password-error')).toBe('Ce champ est obligatoire.');
    expect(api.signIn).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
  });

  it('should sign in and hand the browser back to the provider', async () => {
    await open();
    api.signIn.mockReturnValue(answer({ redirectTo: 'https://auth.example/oidc/auth/uid-1' }));

    await submitWith(' jamie ', ' secret with spaces ');

    expect(api.signIn).toHaveBeenCalledExactlyOnceWith('uid-1', 'jamie', ' secret with spaces ');
    expect(location.assign).toHaveBeenCalledExactlyOnceWith('https://auth.example/oidc/auth/uid-1');
  });

  it('should say the credentials are wrong without saying which, and let the person retry', async () => {
    await open();
    api.signIn.mockReturnValueOnce(failWith(401));

    await submitWith('jamie', 'wrong');

    expect(textOf(host, '[role="alert"]')).toBe(
      "Le nom d'utilisateur ou le mot de passe est incorrect.",
    );
    expect(location.assign).not.toHaveBeenCalled();
    api.signIn.mockReturnValueOnce(failWith(429));
    buttonNamed(host, 'Se connecter').click();
    await settle(harness.fixture);
    expect(textOf(host, '[role="alert"]')).toBe(
      'Trop de tentatives. Patientez une minute avant de réessayer.',
    );
    expect(api.signIn).toHaveBeenCalledTimes(2);
  });

  it('should explain a sign-in that expired before the page opened', async () => {
    api.interaction.mockReturnValue(failWith(410));

    await visit();

    expect(textOf(host, 'h1')).toBe('Cette connexion a expiré');
    expect(host.querySelector('#sign-in-login')).toBeNull();
    expect(linkNamed(host, 'Aller à mon compte').getAttribute('href')).toBe('/account');
  });

  it('should explain a sign-in that expired while the page was open', async () => {
    await open();
    api.signIn.mockReturnValue(failWith(410));

    await submitWith('jamie', 'secret');

    expect(textOf(host, 'h1')).toBe('Cette connexion a expiré');
    expect(location.assign).not.toHaveBeenCalled();
  });

  it('should go back to the app without signing in', async () => {
    await open();
    api.abort.mockReturnValue(answer({ redirectTo: 'https://auth.example/oidc/auth/uid-1' }));

    buttonNamed(host, '← Retour à Plano').click();
    await settle(harness.fixture);

    expect(api.abort).toHaveBeenCalledExactlyOnceWith('uid-1');
    expect(location.assign).toHaveBeenCalledExactlyOnceWith('https://auth.example/oidc/auth/uid-1');
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it('should offer no way back when signing in to the account page itself', async () => {
    await open(interactionFor({ client: { id: 'account', name: 'Compte Synapse', uri: null } }));

    expect(host.textContent).not.toContain('pour continuer vers');
    expect(host.textContent).not.toContain('Retour à');
  });

  it('should fill in the user the app expects, and switch to its language', async () => {
    await open(interactionFor({ loginHint: 'jamie', locale: 'en' }));
    await settle(harness.fixture);

    expect(host.querySelector<HTMLInputElement>('#sign-in-login')?.value).toBe('jamie');
    expect(textOf(host, 'h1')).toBe('Sign in');
  });

  it('should settle a consent prompt at once, as every app is first-party', async () => {
    api.consent.mockReturnValue(answer({ redirectTo: 'https://auth.example/oidc/auth/uid-1' }));

    await open(interactionFor({ prompt: 'consent' }));

    expect(api.consent).toHaveBeenCalledExactlyOnceWith('uid-1');
    expect(location.assign).toHaveBeenCalledExactlyOnceWith('https://auth.example/oidc/auth/uid-1');
  });
});
