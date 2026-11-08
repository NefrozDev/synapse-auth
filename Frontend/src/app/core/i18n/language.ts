import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

/** The languages these pages are written in. Accounts may hold others (Plano's six). */
export const PAGE_LANGUAGES = ['fr', 'en'] as const;
export type PageLanguage = (typeof PAGE_LANGUAGES)[number];

export function isPageLanguage(value: unknown): value is PageLanguage {
  return typeof value === 'string' && (PAGE_LANGUAGES as readonly string[]).includes(value);
}

/**
 * The page language for a language tag: French and English as they are, any other
 * language in English (more widely read than French), nothing for no tag.
 */
export function pageLanguageFor(tag: string | null | undefined): PageLanguage | null {
  if (!tag) return null;
  const base = tag.slice(0, 2).toLowerCase();
  return isPageLanguage(base) ? base : 'en';
}

/** The first browser language the pages know, else French. */
export function browserLanguage(languages: readonly string[]): PageLanguage {
  for (const tag of languages) {
    const base = tag.slice(0, 2).toLowerCase();
    if (isPageLanguage(base)) return base;
  }
  return 'fr';
}

/** Switches the pages to a language once an app or the account tells which. */
@Injectable({ providedIn: 'root' })
export class Language {
  private readonly transloco = inject(TranslocoService);

  get current(): PageLanguage {
    const active = this.transloco.getActiveLang();
    return isPageLanguage(active) ? active : 'fr';
  }

  async use(tag: string | null | undefined): Promise<void> {
    const lang = pageLanguageFor(tag);
    if (!lang || lang === this.current) return;
    await firstValueFrom(this.transloco.load(lang));
    this.transloco.setActiveLang(lang);
    document.documentElement.lang = lang;
  }
}
