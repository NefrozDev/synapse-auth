import { expect, test } from '@playwright/test';
import { openScreen, screens } from './support/screens';

interface FocusStop {
  /** The element, as a person would name it: its tag and text or label. */
  name: string;
  /** A visible outline or ring. */
  indicated: boolean;
  /** The outline against what surrounds it; null for a ring drawn with a shadow. */
  contrast: number | null;
  /** At least part of it shows, not covered by the tab bar or anything else. */
  visible: boolean;
}

/** Describes the focused element; null when the page itself has focus. */
function describeFocus(): FocusStop | null {
  const element = document.activeElement as HTMLElement | null;
  if (!element || element === document.body) return null;

  const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
  const luminance = ([r, g, b]: number[]) => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  // The colour around the element: the first ancestor painting a background.
  const surrounding = () => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const [r, g, b, a = 1] = rgb(getComputedStyle(node).backgroundColor);
      if (a > 0) return [r, g, b];
    }
    return [255, 255, 255];
  };

  const style = getComputedStyle(element);
  const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
  const ring = style.boxShadow !== 'none';
  let contrast: number | null = null;
  if (outline) {
    const [l1, l2] = [luminance(rgb(style.outlineColor)), luminance(surrounding())].sort(
      (a, b) => b - a,
    );
    contrast = Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
  }

  const box = element.getBoundingClientRect();
  const points = [
    [box.left + box.width / 2, box.top + box.height / 2],
    [box.left + 4, box.top + 4],
    [box.right - 4, box.top + 4],
    [box.left + 4, box.bottom - 4],
    [box.right - 4, box.bottom - 4],
  ];
  const visible = points.some(([x, y]) => {
    const top = document.elementFromPoint(x, y);
    return !!top && (element.contains(top) || top.contains(element));
  });

  const label = element.getAttribute('aria-label') ?? element.innerText ?? '';
  return {
    name: `${element.tagName.toLowerCase()} "${label.trim().replace(/\s+/g, ' ').slice(0, 40)}"`,
    indicated: outline || ring,
    contrast,
    visible,
  };
}

test.describe('every screen works with the keyboard alone', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const screen of screens) {
    test(screen.name, async ({ page }) => {
      await openScreen(page, screen);

      // Tab through the page until focus comes back to where it started (2.1.1, 2.1.2).
      const stops: FocusStop[] = [];
      for (let i = 0; i < 60; i++) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(describeFocus);
        if (!stop) continue;
        if (stops.some((seen) => seen.name === stop.name)) break;
        stops.push(stop);
      }

      expect(stops.length, 'something to reach with Tab').toBeGreaterThan(0);
      // 2.4.7: a focus indicator; 1.4.11: an outline at 3:1 against its surroundings;
      // 2.4.11: the focused element is not hidden behind anything.
      const problems = stops.flatMap((stop) => [
        ...(stop.indicated ? [] : [`${stop.name}: no focus indicator`]),
        ...(stop.contrast !== null && stop.contrast < 3
          ? [`${stop.name}: focus outline at ${stop.contrast}:1`]
          : []),
        ...(stop.visible ? [] : [`${stop.name}: hidden while focused`]),
      ]);
      expect(problems).toEqual([]);
    });
  }
});
