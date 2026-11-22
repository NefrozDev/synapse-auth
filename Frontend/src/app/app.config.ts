import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { routes } from './app.routes';
import { provideI18n } from './core/i18n/i18n.providers';
import { TranslatedTitleStrategy } from './core/i18n/translated-title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // The terms' contents and other apps link to their sections (`/terms#privacy`).
      withInMemoryScrolling({ anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(),
    provideI18n(),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
  ],
};
