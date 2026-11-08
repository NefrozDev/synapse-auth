import { HttpErrorResponse } from '@angular/common/http';
import { type Observable, throwError } from 'rxjs';
import type { Account, IdentityApi, InteractionDetails } from '../app/core/api/identity-api';
import type { BrowserLocation } from '../app/core/browser/browser-location';

type Method = {
  [K in keyof IdentityApi]: IdentityApi[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : never;
};

/** Every API call as a spy; specs set what each answers. */
export function fakeApi(): Method {
  const never = () => throwError(() => new Error('unexpected call'));
  return {
    interaction: vi.fn(never),
    signIn: vi.fn(never),
    register: vi.fn(never),
    consent: vi.fn(never),
    abort: vi.fn(never),
    account: vi.fn(never),
    updateProfile: vi.fn(never),
    changeEmail: vi.fn(never),
    changePassword: vi.fn(never),
    signOut: vi.fn(never),
    signOutEverywhere: vi.fn(never),
    deleteAccount: vi.fn(never),
    requestPasswordReset: vi.fn(never),
    confirmPasswordReset: vi.fn(never),
  } as unknown as Method;
}

export function fakeLocation(): BrowserLocation & {
  assign: ReturnType<typeof vi.fn<(url: string) => void>>;
} {
  return { assign: vi.fn<(url: string) => void>() };
}

export function failWith(status: number, body: unknown = null): Observable<never> {
  return throwError(() => new HttpErrorResponse({ status, error: body }));
}

export function interactionFor(overrides: Partial<InteractionDetails> = {}): InteractionDetails {
  return {
    uid: 'uid-1',
    prompt: 'login',
    client: { id: 'plano', name: 'Plano', uri: 'https://plano.example' },
    loginHint: null,
    locale: null,
    ...overrides,
  };
}

export const ACCOUNT: Account = {
  id: 'a1',
  username: 'jamie',
  email: 'jamie@example.test',
  givenName: 'Jamie',
  familyName: 'Doe',
  locale: 'fr',
  createdAt: '2026-11-08T10:00:00.000Z',
  apps: [{ id: 'plano', name: 'Plano', uri: 'https://plano.example' }],
};

/** What a faked call answers. */
export { of as answer } from 'rxjs';
