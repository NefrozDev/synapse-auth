import { expect, test } from '@playwright/test';
import { axeViolations } from './support/axe';
import { mockApi } from './support/mock-api';

// The pages speak French or English: screen readers pick their voice from the page's lang (3.1.1).
test.describe('the page language follows the texts', () => {
  test.use({ locale: 'en-GB' });

  test('an English browser gets English pages, marked as English', async ({ page }) => {
    await mockApi(page);
    await page.goto('/forgot-password');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Forgotten password');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await axeViolations(page)).toEqual([]);
  });

  test("a sign-in follows the app's language over the browser's", async ({ page }) => {
    await mockApi(page);
    await page.goto('/interaction/abc');

    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});
