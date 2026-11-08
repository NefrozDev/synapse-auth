import { importProvidersFrom } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from './i18n/en.json';
import fr from './i18n/fr.json';

/**
 * Added to every TestBed (angular.json `providersFile`): specs render the French texts
 * synchronously, so their assertions read like the site.
 */
export default [
  importProvidersFrom(
    TranslocoTestingModule.forRoot({
      langs: { fr, en },
      translocoConfig: {
        availableLangs: ['fr', 'en'],
        defaultLang: 'fr',
        reRenderOnLangChange: true,
      },
      preloadLangs: true,
    }),
  ),
];
