import { createLocalJWKSet, jwtVerify } from 'jose';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { DataSource } from 'typeorm';
import { ACCOUNT_DELETED_EVENT } from '../src/deletion/account-deletion.service';
import {
  authorize,
  createTestApp,
  exchangeCode,
  followToApp,
  interactionUid,
  ISSUER,
  newAccount,
  PUBLIC_URL,
  type Receiver,
  signUpThroughApp,
  startReceiver,
  testClients,
  type TestApp,
  eventually,
  waitFor,
} from './e2e-helpers';

describe('The account page API', () => {
  let receiver: Receiver;
  let testApp: TestApp;

  beforeAll(async () => {
    receiver = await startReceiver();
    testApp = await createTestApp(testClients(receiver.url));
  });

  afterAll(async () => {
    await testApp.close();
    await receiver.close();
  });

  beforeEach(() => {
    receiver.received.length = 0;
    receiver.status = 200;
  });

  const agent = () => request.agent(testApp.app.getHttpServer());

  async function signedIn(account = newAccount()): Promise<{
    browser: TestAgent;
    account: ReturnType<typeof newAccount>;
    sub: string;
  }> {
    const browser = agent();
    const { code, verifier } = await signUpThroughApp(browser, account);
    const tokens = await exchangeCode(testApp.app, code, verifier);
    const me = await browser.get('/api/account');
    expect(me.status).toBe(200);
    expect(tokens.status).toBe(200);
    return { browser, account, sub: me.body.id as string };
  }

  async function verifiedJwt(jwt: string, audience: string) {
    const jwks = await request(testApp.app.getHttpServer()).get('/oidc/jwks');
    return jwtVerify(jwt, createLocalJWKSet(jwks.body as { keys: [] }), {
      issuer: ISSUER,
      audience,
    });
  }

  it('answers 401 to a browser that is not signed in', async () => {
    const response = await agent().get('/api/account');
    expect(response.status).toBe(401);
  });

  it('shows the account and the apps it opens, never its password', async () => {
    const { browser, account } = await signedIn();

    const response = await browser.get('/api/account');

    expect(response.body).toMatchObject({
      username: account.username,
      email: account.email,
      givenName: 'Jamie',
      familyName: 'Doe',
      locale: 'en',
      apps: [
        { id: 'app', name: 'Test App', uri: 'http://app.test' },
        { id: 'other', name: 'Other App', uri: 'http://other.test' },
      ],
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|scrypt/i);
  });

  it('starts its own sign-in with state and PKCE, and checks the state on return', async () => {
    const browser = agent();

    const start = await browser.get('/api/account/sign-in?lang=en');
    expect(start.status).toBe(303);
    const authUrl = new URL(start.headers.location);
    expect(authUrl.origin + authUrl.pathname).toBe(`${ISSUER}/auth`);
    expect(Object.fromEntries(authUrl.searchParams)).toMatchObject({
      client_id: 'account',
      response_type: 'code',
      redirect_uri: `${PUBLIC_URL}/api/account/callback`,
      code_challenge_method: 'S256',
      ui_locales: 'en',
    });
    const state = authUrl.searchParams.get('state')!;

    const forged = await browser.get(
      '/api/account/callback?code=c&state=forged',
    );
    expect(forged.headers.location).toBe('/account?signInFailed=1');

    // The cookie went with the forged attempt: a new sign-in is needed.
    const late = await browser.get(
      `/api/account/callback?code=c&state=${state}`,
    );
    expect(late.headers.location).toBe('/account?signInFailed=1');

    // Cancelled: the right state, but an error and no code.
    const cancelled = await browser.get('/api/account/sign-in');
    const cancelledState = new URL(cancelled.headers.location).searchParams.get(
      'state',
    );
    const denied = await browser.get(
      `/api/account/callback?error=access_denied&state=${cancelledState}`,
    );
    expect(denied.headers.location).toBe('/account?signInFailed=1');

    const again = await browser.get('/api/account/sign-in');
    const newState = new URL(again.headers.location).searchParams.get('state');
    const ok = await browser.get(
      `/api/account/callback?code=c&state=${newState}`,
    );
    expect(ok.status).toBe(303);
    expect(ok.headers.location).toBe('/account');
  });

  it('changes the profile, refusing a taken username', async () => {
    const { browser } = await signedIn();
    const other = newAccount();
    await signedIn(other);

    const changed = await browser.patch('/api/account').send({
      givenName: ' Sam ',
      locale: 'fr',
      username: 'sam.doe' + Date.now(),
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      givenName: 'Sam',
      familyName: 'Doe',
      locale: 'fr',
    });

    const taken = await browser
      .patch('/api/account')
      .send({ username: other.username.toUpperCase() });
    expect(taken.status).toBe(409);
    const unchanged = await browser.get('/api/account');
    expect(unchanged.body.givenName).toBe('Sam');
  });

  it('changes the e-mail address only with the password', async () => {
    const { browser, account } = await signedIn();

    const wrong = await browser
      .put('/api/account/email')
      .send({ email: 'new@example.test', password: 'nope' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.field).toBe('password');

    const email = `new${Date.now()}@example.test`;
    const right = await browser
      .put('/api/account/email')
      .send({ email, password: account.password });
    expect(right.status).toBe(200);
    expect(right.body.email).toBe(email);
  });

  it('changes the password, keeping this browser and signing out the others in every app', async () => {
    const { browser, account } = await signedIn();
    const otherBrowser = agent();
    const { location } = await authorize(otherBrowser);
    const otherLogin = await otherBrowser
      .post(`/api/interaction/${interactionUid(location)}/login`)
      .send({ login: account.username, password: account.password });
    // Back through the provider to the app: the session now covers the app.
    await followToApp(otherBrowser, otherLogin.body.redirectTo as string);
    receiver.received.length = 0;

    const wrong = await browser
      .put('/api/account/password')
      .send({ currentPassword: 'nope', newPassword: 'a new long password' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.field).toBe('currentPassword');

    const changed = await browser.put('/api/account/password').send({
      currentPassword: account.password,
      newPassword: 'a new long password',
    });
    expect(changed.status).toBe(204);

    expect((await browser.get('/api/account')).status).toBe(200);
    expect((await otherBrowser.get('/api/account')).status).toBe(401);
    // The other browser had signed in to the app: the app hears about it.
    expect(receiver.received.map((r) => r.path)).toEqual([
      '/backchannel-logout',
    ]);
  });

  it('signs out of every app: the app gets a signed logout token for its session', async () => {
    const { browser, sub } = await signedIn();

    const response = await browser.post('/api/account/sign-out');
    expect(response.status).toBe(204);
    expect((await browser.get('/api/account')).status).toBe(401);

    expect(receiver.received).toHaveLength(1);
    const logout = receiver.received[0];
    expect(logout.path).toBe('/backchannel-logout');
    const token = new URLSearchParams(logout.body).get('logout_token')!;
    const { payload } = await verifiedJwt(token, 'app');
    expect(payload.sub).toBe(sub);
    expect(payload.events).toEqual({
      'http://schemas.openid.net/event/backchannel-logout': {},
    });
    expect(typeof payload.sid).toBe('string');

    // Signing in to an app again asks who you are.
    const { location } = await authorize(browser);
    expect(location).toMatch(/^\/api\/interaction\//);
  });

  it('signs out everywhere', async () => {
    const { browser, account } = await signedIn();
    const otherBrowser = agent();
    const { location } = await authorize(otherBrowser);
    const otherLogin = await otherBrowser
      .post(`/api/interaction/${interactionUid(location)}/login`)
      .send({ login: account.username, password: account.password });
    // Back through the provider to the app: the session now covers the app.
    await followToApp(otherBrowser, otherLogin.body.redirectTo as string);
    receiver.received.length = 0;

    const response = await browser.post('/api/account/sign-out-everywhere');

    expect(response.status).toBe(204);
    expect((await browser.get('/api/account')).status).toBe(401);
    expect((await otherBrowser.get('/api/account')).status).toBe(401);
    // Both browsers had signed in to the app: it hears about both sessions.
    expect(receiver.received.map((r) => r.path)).toEqual([
      '/backchannel-logout',
      '/backchannel-logout',
    ]);
  });

  it('keeps the account when the deletion password is wrong', async () => {
    const { browser } = await signedIn();

    const response = await browser
      .delete('/api/account')
      .send({ password: 'nope' });

    expect(response.status).toBe(400);
    expect(response.body.field).toBe('password');
    expect((await browser.get('/api/account')).status).toBe(200);
    expect(receiver.received).toHaveLength(0);
  });

  it('deletes the account: sessions end, its rows go, and each app gets a signed deletion notice', async () => {
    const { browser, account, sub } = await signedIn();
    const dataSource = testApp.app.get(DataSource);

    const response = await browser
      .delete('/api/account')
      .send({ password: account.password });

    expect(response.status).toBe(204);
    expect((await browser.get('/api/account')).status).toBe(401);
    await waitFor(() =>
      receiver.received.some((r) => r.path === '/account-deleted'),
    );
    const notice = receiver.received.find(
      (r) => r.path === '/account-deleted',
    )!;
    expect(notice.contentType).toBe('application/secevent+jwt');
    const { payload, protectedHeader } = await verifiedJwt(notice.body, 'app');
    expect(protectedHeader.typ).toBe('secevent+jwt');
    expect(payload.sub).toBe(sub);
    expect(payload.events).toEqual({ [ACCOUNT_DELETED_EVENT]: {} });
    // Only the app that asked to be told: "other" has no account_deletion_uri.
    expect(
      receiver.received.filter((r) => r.path === '/account-deleted'),
    ).toHaveLength(1);

    const [{ count: accounts }] = await dataSource.query(
      'SELECT count(*)::int AS count FROM accounts WHERE id = $1',
      [sub],
    );
    const [{ count: payloads }] = await dataSource.query(
      'SELECT count(*)::int AS count FROM oidc_payloads WHERE account_id = $1',
      [sub],
    );
    expect(accounts).toBe(0);
    expect(payloads).toBe(0);
    // Confirmed by the app: the notice is gone.
    await eventually(async () => {
      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int AS count FROM account_deletion_notices WHERE account_id = $1',
        [sub],
      );
      return count === 0;
    });

    // The name is free again, and the old password opens nothing.
    const { location } = await authorize(agent());
    const login = await agent()
      .post(`/api/interaction/${interactionUid(location)}/login`)
      .send({ login: account.username, password: account.password });
    expect(login.status).not.toBe(200);
  });

  it('keeps a deletion notice for later when the app is down', async () => {
    const { browser, account, sub } = await signedIn();
    const dataSource = testApp.app.get(DataSource);
    receiver.status = 503;

    await browser.delete('/api/account').send({ password: account.password });
    let rows: { attempts: number; last_error: string | null }[] = [];
    await eventually(async () => {
      rows = await dataSource.query(
        'SELECT attempts, last_error FROM account_deletion_notices WHERE account_id = $1',
        [sub],
      );
      return rows[0]?.attempts === 1;
    });
    expect(rows).toEqual([{ attempts: 1, last_error: 'HTTP 503' }]);
    expect(
      receiver.received.filter((r) => r.path === '/account-deleted'),
    ).toHaveLength(1);
  });

  it('refuses account changes posted from another site (CSRF)', async () => {
    const { browser } = await signedIn();

    const response = await browser
      .delete('/api/account')
      .set('Origin', 'https://evil.test')
      .send({ password: 'whatever' });

    expect(response.status).toBe(403);
    expect((await browser.get('/api/account')).status).toBe(200);
  });
});
