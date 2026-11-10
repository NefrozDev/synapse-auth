import type { Page, Route } from '@playwright/test';

export interface MockOptions {
  /** The account page's own session: none answers 401. */
  signedIn?: boolean;
}

const account = {
  id: 'a1',
  username: 'nefroz',
  email: 'nefroz@example.com',
  givenName: 'Steven',
  familyName: 'De Moor',
  locale: 'fr',
  createdAt: '2026-10-01T08:00:00Z',
  apps: [
    { id: 'plano', name: 'Plano', uri: 'https://plano.example' },
    { id: 'erudi', name: 'Erudi', uri: 'https://erudi.example' },
  ],
};

/**
 * Answers every /api call the pages make. The sign-in started by Erudi is `abc`, `gone` has
 * expired; a sign-in attempt is always refused, and a new password always accepted.
 */
export async function mockApi(page: Page, options: MockOptions = {}): Promise<void> {
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const problem = (status: number, extra: object = {}) =>
      json({ statusCode: status, message: 'Refused', ...extra }, status);

    const interaction = /^\/api\/interaction\/([^/]+)\/(.+)$/.exec(pathname);
    if (interaction) {
      if (interaction[1] !== 'abc') return problem(410);
      if (interaction[2] === 'details') {
        return json({
          uid: 'abc',
          prompt: 'login',
          client: { id: 'erudi', name: 'Erudi', uri: 'https://erudi.example' },
          loginHint: null,
          locale: 'fr',
        });
      }
      if (interaction[2] === 'login') return problem(401);
      if (interaction[2] === 'register') return problem(409);
      return json({ redirectTo: 'https://erudi.example' });
    }

    if (pathname === '/api/account' && method === 'GET') {
      return options.signedIn === false ? problem(401) : json(account);
    }
    if (pathname.startsWith('/api/account')) {
      return method === 'PATCH' || method === 'PUT'
        ? json(account)
        : route.fulfill({ status: 204 });
    }
    if (pathname === '/api/password-reset' || pathname === '/api/password-reset/confirm') {
      return route.fulfill({ status: 204 });
    }
    return problem(404);
  });
}
