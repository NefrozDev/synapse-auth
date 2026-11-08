import { InjectionToken } from '@angular/core';

/**
 * Full-page navigations: back to the provider (then to an app), or to the API's
 * sign-in. Specs provide a fake to see where the page would have gone.
 */
export interface BrowserLocation {
  assign(url: string): void;
}

export const BROWSER_LOCATION = new InjectionToken<BrowserLocation>('BROWSER_LOCATION', {
  providedIn: 'root',
  factory: () => ({ assign: (url: string) => window.location.assign(url) }),
});
