import { ComponentFixture } from '@angular/core/testing';

export function query<T extends Element = HTMLElement>(host: Element, selector: string): T {
  const element = host.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Nothing matches "${selector}".`);
  }
  return element;
}

export function textOf(host: Element, selector: string): string {
  return query(host, selector).textContent?.trim() ?? '';
}

/** Types like a person would: the signal form listens to `input` events. */
export function typeInto(host: Element, selector: string, value: string): void {
  const input = query<HTMLInputElement>(host, selector);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

export function buttonNamed(host: Element, name: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!button) {
    throw new Error(`No button named "${name}".`);
  }
  return button;
}

export function linkNamed(host: Element, name: string): HTMLAnchorElement {
  const link = [...host.querySelectorAll<HTMLAnchorElement>('a')].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!link) {
    throw new Error(`No link named "${name}".`);
  }
  return link;
}

/** Lets pending promises (form submissions, mocked API calls) finish, then renders. */
export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
}
