import { expect, test } from '@playwright/test';
import { axeViolations } from './support/axe';
import { openScreen, screens } from './support/screens';

test.describe('every screen meets the automated WCAG 2.2 AA rules', () => {
  // Still frames: a colour check must not land halfway through an animation.
  test.use({ reducedMotion: 'reduce' });

  for (const screen of screens) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, screen);

      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
