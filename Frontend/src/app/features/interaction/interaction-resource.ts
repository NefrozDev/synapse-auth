import { Signal, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { httpStatus } from '../../core/api/api-errors';
import { IdentityApi, type InteractionDetails } from '../../core/api/identity-api';
import { BROWSER_LOCATION } from '../../core/browser/browser-location';
import { Language } from '../../core/i18n/language';

export { failureMessage as explainFailure } from '../../core/api/api-errors';

/**
 * The sign-in an app started, for the sign-in and sign-up pages: loads it,
 * switches to the language the app asked for, and settles a consent prompt
 * at once (every Synapse app is first-party). Call in an injection context.
 */
export function interactionResource(uid: Signal<string>) {
  const api = inject(IdentityApi);
  const language = inject(Language);
  const location = inject(BROWSER_LOCATION);

  const details = rxResource<InteractionDetails, string>({
    params: () => uid(),
    stream: ({ params }) => api.interaction(params),
  });

  effect(() => {
    if (!details.hasValue()) return;
    const value = details.value();
    void language.use(value.locale);
    if (value.prompt === 'consent') {
      void firstValueFrom(api.consent(value.uid)).then(({ redirectTo }) =>
        location.assign(redirectTo),
      );
    }
  });

  return details;
}

/** True once the API says the sign-in is unknown or over (410). */
export function isExpired(error: unknown): boolean {
  return httpStatus(error) === 410;
}
