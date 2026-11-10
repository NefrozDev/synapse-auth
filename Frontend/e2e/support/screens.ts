import { expect, type Page } from '@playwright/test';
import { mockApi, type MockOptions } from './mock-api';

export interface Screen {
  name: string;
  url: string;
  mock?: MockOptions;
  /** Brings the screen to the state to check, once it has loaded. */
  act?: (page: Page) => Promise<void>;
}

const VALID_TOKEN = 'a'.repeat(43);

// Every page, in each of its states that shows something different.
export const screens: Screen[] = [
  { name: 'sign-in', url: '/interaction/abc' },
  {
    name: 'sign-in with errors',
    url: '/interaction/abc',
    act: async (page) => {
      await page.getByRole('button', { name: 'Se connecter' }).click();
    },
  },
  {
    name: 'sign-in refused',
    url: '/interaction/abc',
    act: async (page) => {
      await page.getByLabel("Nom d'utilisateur ou adresse e-mail").fill('nefroz');
      await page.getByLabel('Mot de passe', { exact: true }).fill('not the password');
      await page.getByRole('button', { name: 'Se connecter' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  { name: 'sign-in expired', url: '/interaction/gone' },
  { name: 'sign-up', url: '/interaction/abc/sign-up' },
  {
    name: 'sign-up with errors',
    url: '/interaction/abc/sign-up',
    act: async (page) => {
      await page.getByRole('button', { name: 'Créer mon compte' }).click();
    },
  },
  { name: 'forgot password', url: '/forgot-password' },
  {
    name: 'forgot password with an error',
    url: '/forgot-password',
    act: async (page) => {
      await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    },
  },
  {
    name: 'forgot password sent',
    url: '/forgot-password',
    act: async (page) => {
      await page.getByLabel('Adresse e-mail').fill('nefroz@example.com');
      await page.getByRole('button', { name: 'Envoyer le lien' }).click();
      await expect(page.getByText('Si un compte utilise cette adresse')).toBeVisible();
    },
  },
  { name: 'new password', url: `/reset-password#token=${VALID_TOKEN}` },
  { name: 'new password, link no longer valid', url: '/reset-password' },
  {
    name: 'new password saved',
    url: `/reset-password#token=${VALID_TOKEN}`,
    act: async (page) => {
      await page
        .getByRole('textbox', { name: 'Nouveau mot de passe' })
        .fill('a much longer password');
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByText('Votre mot de passe est changé')).toBeVisible();
    },
  },
  { name: 'account', url: '/account' },
  {
    name: 'account, deleting without a password',
    url: '/account',
    act: async (page) => {
      await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
    },
  },
  { name: 'account, sign-in failed', url: '/account?signInFailed=1', mock: { signedIn: false } },
  { name: 'signed out', url: '/signed-out' },
  { name: 'account deleted', url: '/signed-out?deleted=1' },
  { name: 'terms', url: '/terms' },
];

/** Opens the page with its mocked data and brings it to its state, ready to check. */
export async function openScreen(page: Page, screen: Screen): Promise<void> {
  await mockApi(page, screen.mock);
  await page.goto(screen.url);
  await expect(page.locator('h1, h2').first()).toBeAttached();
  await screen.act?.(page);
  await page.waitForLoadState('networkidle');
}
