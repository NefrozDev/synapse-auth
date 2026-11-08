import {
  EnvironmentProviders,
  Injectable,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import {
  Translation,
  TranslocoLoader,
  TranslocoService,
  provideTransloco,
} from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { browserLanguage, PAGE_LANGUAGES } from './language';

/**
 * Each language file is its own lazy chunk with a hashed name: a deploy that changes
 * translations changes the URL, so browsers never keep stale texts.
 */
@Injectable({ providedIn: 'root' })
export class BundledTranslationLoader implements TranslocoLoader {
  async getTranslation(lang: string): Promise<Translation> {
    const file = (await import(`../../../i18n/${lang}.json`)) as { default: Translation };
    return file.default;
  }
}

export function provideI18n(): EnvironmentProviders[] {
  return [
    ...provideTransloco({
      config: {
        availableLangs: [...PAGE_LANGUAGES],
        defaultLang: 'fr',
        fallbackLang: 'fr',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
      },
      loader: BundledTranslationLoader,
    }),
    // The browser's language is loaded before the first screen, so keys never flash.
    // Pages switch to the app's or the account's language once they know it.
    provideAppInitializer(async () => {
      const transloco = inject(TranslocoService);
      const lang = browserLanguage(navigator.languages);
      await firstValueFrom(transloco.load(lang));
      transloco.setActiveLang(lang);
      document.documentElement.lang = lang;
    }),
  ];
}
