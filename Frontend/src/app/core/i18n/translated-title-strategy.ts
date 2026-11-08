import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Routes give a translation key as `title`; the tab shows "Page · Compte Synapse".
 * Screen readers announce it on navigation, so each screen gets one.
 */
@Injectable({ providedIn: 'root' })
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const key = this.buildTitle(snapshot);
    const site = this.transloco.translate('site.name');
    this.title.setTitle(key ? `${this.transloco.translate(key)} · ${site}` : site);
  }
}
