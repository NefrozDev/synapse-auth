import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { query, settle } from '../../../testing/dom';
import { PasswordToggle } from './password-toggle';

@Component({
  imports: [PasswordToggle],
  template: `
    <form (submit)="$event.preventDefault()">
      <input #secret id="secret" type="password" />
      <app-password-toggle [input]="secret" />
      <button type="submit">Send</button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {}

describe('PasswordToggle', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await settle(fixture);
    const host = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      field: query<HTMLInputElement>(host, '#secret'),
      toggle: query<HTMLButtonElement>(host, '.password-toggle'),
      status: query(host, '[aria-live="polite"]'),
      form: query<HTMLFormElement>(host, 'form'),
    };
  }

  it('should start hidden, as a button that controls the field and submits nothing', async () => {
    const { field, toggle, status } = await render();

    expect(field.type).toBe('password');
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-controls')).toBe('secret');
    expect(toggle.textContent?.trim()).toBe('Afficher');
    expect(toggle.getAttribute('aria-label')).toBe('Afficher le mot de passe');
    expect(status.textContent?.trim()).toBe('');
  });

  it('should show the password, then hide it again, announcing each change', async () => {
    const { fixture, field, toggle, status } = await render();

    toggle.click();
    await settle(fixture);
    expect(field.type).toBe('text');
    expect(toggle.textContent?.trim()).toBe('Masquer');
    expect(toggle.getAttribute('aria-label')).toBe('Masquer le mot de passe');
    expect(status.textContent?.trim()).toBe('Le mot de passe est visible.');

    toggle.click();
    await settle(fixture);
    expect(field.type).toBe('password');
    expect(toggle.textContent?.trim()).toBe('Afficher');
    expect(status.textContent?.trim()).toBe('Le mot de passe est masqué.');
  });

  it('should hide a shown password as soon as the form is submitted', async () => {
    const { fixture, field, toggle, form } = await render();
    toggle.click();
    await settle(fixture);
    // Seen by the submit listeners that run after ours, such as password managers.
    let typeAtSubmit = '';
    form.addEventListener('submit', () => (typeAtSubmit = field.type));

    form.requestSubmit();

    expect(typeAtSubmit).toBe('password');
    await settle(fixture);
    expect(toggle.textContent?.trim()).toBe('Afficher');
  });

  it('should leave a hidden password alone on submit, announcing nothing', async () => {
    const { fixture, field, form, status } = await render();

    form.requestSubmit();
    await settle(fixture);

    expect(field.type).toBe('password');
    expect(status.textContent?.trim()).toBe('');
  });
});
