import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IdentityApi } from '../../core/api/identity-api';
import { BROWSER_LOCATION } from '../../core/browser/browser-location';
import { buttonNamed, linkNamed, query, settle, textOf, typeInto } from '../../../testing/dom';
import { ACCOUNT, answer, failWith, fakeApi, fakeLocation } from '../../../testing/fake-api';
import { AccountPage } from './account-page';

describe('AccountPage', () => {
  let api: ReturnType<typeof fakeApi>;
  let location: ReturnType<typeof fakeLocation>;
  let harness: RouterTestingHarness;
  let host: HTMLElement;

  beforeEach(() => {
    api = fakeApi();
    location = fakeLocation();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'account', component: AccountPage },
            { path: 'signed-out', children: [] },
          ],
          withComponentInputBinding(),
        ),
        { provide: IdentityApi, useValue: api },
        { provide: BROWSER_LOCATION, useValue: location },
      ],
    });
  });

  async function visit(url = '/account'): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    host = harness.routeNativeElement!;
    await settle(harness.fixture);
  }

  async function signedIn(): Promise<void> {
    api.account.mockReturnValue(answer(ACCOUNT));
    await visit();
  }

  it('should start the sign-in when this browser is not signed in', async () => {
    api.account.mockReturnValue(failWith(401));

    await visit();

    expect(location.assign).toHaveBeenCalledExactlyOnceWith('/api/account/sign-in?lang=fr');
  });

  it('should not start it again after a failed sign-in, but offer to', async () => {
    api.account.mockReturnValue(failWith(401));

    await visit('/account?signInFailed=1');

    expect(location.assign).not.toHaveBeenCalled();
    expect(linkNamed(host, 'Se connecter').getAttribute('href')).toBe(
      '/api/account/sign-in?lang=fr',
    );
  });

  it('should greet the person and list the apps the account opens', async () => {
    await signedIn();

    expect(textOf(host, 'h1')).toBe('Bonjour Jamie');
    expect(host.textContent).toContain('jamie · jamie@example.test');
    expect(linkNamed(host, 'P Plano').getAttribute('href')).toBe('https://plano.example');
    expect(query<HTMLInputElement>(host, '#profile-username').value).toBe('jamie');
  });

  it('should save the profile and show the new name', async () => {
    await signedIn();
    api.updateProfile.mockReturnValue(answer({ ...ACCOUNT, givenName: 'Sam' }));

    typeInto(host, '#profile-given-name', ' Sam ');
    buttonNamed(host, 'Enregistrer').click();
    await settle(harness.fixture);

    expect(api.updateProfile).toHaveBeenCalledExactlyOnceWith({
      givenName: 'Sam',
      familyName: 'Doe',
      username: 'jamie',
      locale: 'fr',
    });
    expect(textOf(host, 'h1')).toBe('Bonjour Sam');
    expect(textOf(host, '#profile-title ~ form [role="status"]')).toBe(
      'Modifications enregistrées.',
    );
  });

  it('should put a wrong password on its field when changing the password', async () => {
    await signedIn();
    api.changePassword.mockReturnValue(failWith(400, { field: 'currentPassword' }));

    typeInto(host, '#password-current', 'wrong');
    typeInto(host, '#password-new', 'a new long password');
    buttonNamed(host, 'Changer de mot de passe').click();
    await settle(harness.fixture);

    expect(api.changePassword).toHaveBeenCalledExactlyOnceWith('wrong', 'a new long password');
    expect(textOf(host, '#password-title ~ form .form-error')).toBe(
      'Le mot de passe est incorrect.',
    );
  });

  it('should sign out and say so', async () => {
    await signedIn();
    api.signOut.mockReturnValue(answer(undefined));

    buttonNamed(host, 'Se déconnecter').click();
    await settle(harness.fixture);

    expect(api.signOut).toHaveBeenCalledOnce();
    expect(api.signOutEverywhere).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/signed-out');
  });

  it('should keep the account on a wrong deletion password, and delete it with the right one', async () => {
    await signedIn();
    api.deleteAccount.mockReturnValueOnce(failWith(400, { field: 'password' }));

    typeInto(host, '#delete-password', 'wrong');
    buttonNamed(host, 'Supprimer définitivement').click();
    await settle(harness.fixture);
    expect(textOf(host, '#delete-password-error')).toBe('Le mot de passe est incorrect.');
    expect(TestBed.inject(Router).url).toBe('/account');

    api.deleteAccount.mockReturnValueOnce(answer(undefined));
    typeInto(host, '#delete-password', 'right');
    buttonNamed(host, 'Supprimer définitivement').click();
    await settle(harness.fixture);

    expect(api.deleteAccount).toHaveBeenNthCalledWith(2, 'right');
    expect(TestBed.inject(Router).url).toBe('/signed-out?deleted=1');
  });
});
