import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IdentityApi } from '../../core/api/identity-api';
import { buttonNamed, linkNamed, settle, textOf, typeInto } from '../../../testing/dom';
import { answer, failWith, fakeApi } from '../../../testing/fake-api';
import { ForgotPassword } from './forgot-password/forgot-password';
import { ResetPassword } from './reset-password/reset-password';

const TOKEN = 'a'.repeat(43);

describe('Password recovery pages', () => {
  let api: ReturnType<typeof fakeApi>;
  let harness: RouterTestingHarness;
  let host: HTMLElement;

  beforeEach(() => {
    api = fakeApi();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'forgot-password', component: ForgotPassword },
            { path: 'reset-password', component: ResetPassword },
            { path: 'account', children: [] },
            { path: 'interaction/:uid', children: [] },
          ],
          withComponentInputBinding(),
        ),
        { provide: IdentityApi, useValue: api },
      ],
    });
  });

  async function visit(url: string): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    host = harness.routeNativeElement!;
    await settle(harness.fixture);
  }

  describe('ForgotPassword', () => {
    it('should send the address and confirm the same way whether it has an account or not', async () => {
      api.requestPasswordReset.mockReturnValue(answer(undefined));
      await visit('/forgot-password?return=/interaction/uid-1');

      typeInto(host, '#forgot-email', 'jamie@example.test');
      buttonNamed(host, 'Envoyer le lien').click();
      await settle(harness.fixture);

      expect(api.requestPasswordReset).toHaveBeenCalledExactlyOnceWith('jamie@example.test');
      expect(textOf(host, '[role="status"]')).toContain('Si un compte utilise cette adresse');
      expect(host.querySelector('#forgot-email')).toBeNull();
      expect(linkNamed(host, '← Retour à la connexion').getAttribute('href')).toBe(
        '/interaction/uid-1',
      );
    });

    it('should only go back to a sign-in page of this site', async () => {
      await visit('/forgot-password?return=https://evil.test');

      expect(linkNamed(host, '← Retour à la connexion').getAttribute('href')).toBe('/account');
    });

    it('should check the address before sending', async () => {
      await visit('/forgot-password');

      typeInto(host, '#forgot-email', 'not an address');
      buttonNamed(host, 'Envoyer le lien').click();
      await settle(harness.fixture);

      expect(textOf(host, '#forgot-email-error')).toBe('Saisissez une adresse e-mail valide.');
      expect(api.requestPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('ResetPassword', () => {
    it('should set the new password with the token, then drop it from the address', async () => {
      api.confirmPasswordReset.mockReturnValue(answer(undefined));
      await visit(`/reset-password#token=${TOKEN}`);
      expect(TestBed.inject(Router).url).toBe('/reset-password');

      typeInto(host, '#reset-password', 'a brand new password');
      buttonNamed(host, 'Enregistrer').click();
      await settle(harness.fixture);

      expect(api.confirmPasswordReset).toHaveBeenCalledExactlyOnceWith(
        TOKEN,
        'a brand new password',
      );
      expect(textOf(host, '[role="status"]')).toContain('Votre mot de passe est changé.');
      expect(linkNamed(host, 'Me connecter').getAttribute('href')).toBe('/account');
    });

    it('should refuse a link without a valid token, without calling the API', async () => {
      await visit('/reset-password#token=short');

      expect(textOf(host, '[role="alert"]')).toBe(
        "Ce lien n'est plus valable. Demandez-en un nouveau.",
      );
      expect(linkNamed(host, 'Demander un nouveau lien').getAttribute('href')).toBe(
        '/forgot-password',
      );
      expect(api.confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('should explain a used or expired link', async () => {
      api.confirmPasswordReset.mockReturnValue(failWith(400));
      await visit(`/reset-password#token=${TOKEN}`);

      typeInto(host, '#reset-password', 'a brand new password');
      buttonNamed(host, 'Enregistrer').click();
      await settle(harness.fixture);

      expect(textOf(host, '[role="alert"]')).toBe(
        "Ce lien n'est plus valable. Demandez-en un nouveau.",
      );
    });
  });
});
