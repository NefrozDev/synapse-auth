import { createLocalJWKSet, jwtVerify } from 'jose';
import request from 'supertest';
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
} from './e2e-helpers';

describe('Signing in through an app (OpenID Connect)', () => {
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

  const agent = () => request.agent(testApp.app.getHttpServer());

  it('publishes its configuration, with PKCE and the code flow only', async () => {
    const response = await request(testApp.app.getHttpServer()).get(
      '/oidc/.well-known/openid-configuration',
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      issuer: ISSUER,
      code_challenge_methods_supported: ['S256'],
      response_types_supported: ['code'],
      backchannel_logout_supported: true,
    });
    // Endpoints follow the request's host (the test server's), the issuer does not.
    expect(response.body.end_session_endpoint).toMatch(/\/oidc\/session\/end$/);
  });

  it('sends the browser to the sign-in page, then hands the app a code for signed ID tokens', async () => {
    const browser = agent();
    const account = newAccount();
    const { verifier, location } = await authorize(browser);
    const uid = interactionUid(location);

    // The API address hands over to the Angular page.
    const page = await browser.get(location);
    expect(page.status).toBe(303);
    expect(page.headers.location).toBe(`/interaction/${uid}`);

    const details = await browser.get(`/api/interaction/${uid}/details`);
    expect(details.status).toBe(200);
    expect(details.body).toEqual({
      uid,
      prompt: 'login',
      client: { id: 'app', name: 'Test App', uri: 'http://app.test' },
      loginHint: null,
      locale: null,
    });

    const registered = await browser
      .post(`/api/interaction/${uid}/register`)
      .send(account);
    expect(registered.status).toBe(200);
    const back = await followToApp(
      browser,
      registered.body.redirectTo as string,
    );
    expect(back.origin + back.pathname).toBe('http://app.test/callback');
    expect(back.searchParams.get('state')).toBe('state-1');

    const tokens = await exchangeCode(
      testApp.app,
      back.searchParams.get('code')!,
      verifier,
    );
    expect(tokens.status).toBe(200);
    const jwks = await request(testApp.app.getHttpServer()).get('/oidc/jwks');
    const { payload } = await jwtVerify(
      tokens.body.id_token as string,
      createLocalJWKSet(jwks.body as { keys: [] }),
      { issuer: ISSUER, audience: 'app' },
    );
    expect(payload).toMatchObject({
      preferred_username: account.username,
      given_name: 'Jamie',
      family_name: 'Doe',
      name: 'Jamie Doe',
      email: account.email,
      email_verified: false,
      locale: 'en',
      nonce: 'nonce-1',
    });
    expect(typeof payload.sub).toBe('string');
    expect(typeof payload.sid).toBe('string');
  });

  it('signs a known person in with their username or e-mail address', async () => {
    const account = newAccount();
    await signUpThroughApp(agent(), account);

    for (const login of [account.username.toUpperCase(), account.email]) {
      const browser = agent();
      const { location } = await authorize(browser);
      const response = await browser
        .post(`/api/interaction/${interactionUid(location)}/login`)
        .send({ login, password: account.password });

      expect(response.status).toBe(200);
      const back = await followToApp(
        browser,
        response.body.redirectTo as string,
      );
      expect(back.searchParams.get('code')).toBeTruthy();
    }
  });

  it('refuses a wrong password, and the sign-in can still be finished', async () => {
    const account = newAccount();
    await signUpThroughApp(agent(), account);
    const browser = agent();
    const { location } = await authorize(browser);
    const uid = interactionUid(location);

    const wrong = await browser
      .post(`/api/interaction/${uid}/login`)
      .send({ login: account.username, password: 'not the password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe('The username or password is incorrect.');

    const right = await browser
      .post(`/api/interaction/${uid}/login`)
      .send({ login: account.username, password: account.password });
    expect(right.status).toBe(200);
  });

  it('opens a second app without asking again: that is the single sign-on', async () => {
    const browser = agent();
    await signUpThroughApp(browser);

    const other = await browser.get(
      `/oidc/auth?${new URLSearchParams({
        client_id: 'other',
        response_type: 'code',
        scope: 'openid',
        redirect_uri: 'http://other.test/callback',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
      }).toString()}`,
    );

    expect(other.status).toBe(303);
    expect(other.headers.location).toMatch(
      /^http:\/\/other\.test\/callback\?code=/,
    );
  });

  it('refuses a taken username or e-mail address, in any case', async () => {
    const account = newAccount();
    await signUpThroughApp(agent(), account);

    for (const clash of [
      { ...newAccount(), username: account.username.toUpperCase() },
      { ...newAccount(), email: account.email.toUpperCase() },
    ]) {
      const browser = agent();
      const { location } = await authorize(browser);
      const response = await browser
        .post(`/api/interaction/${interactionUid(location)}/register`)
        .send(clash);
      expect(response.status).toBe(409);
      expect(response.body.message).toBe(
        'This username or e-mail address is already used.',
      );
    }
  });

  it('refuses a sign-up without the terms or with invalid fields', async () => {
    const browser = agent();
    const { location } = await authorize(browser);
    const uid = interactionUid(location);

    for (const invalid of [
      { ...newAccount(), acceptedTerms: false },
      { ...newAccount(), username: 'a b' },
      { ...newAccount(), password: 'short' },
      { ...newAccount(), givenName: '   ' },
      { ...newAccount(), extra: 'field' },
    ]) {
      const response = await browser
        .post(`/api/interaction/${uid}/register`)
        .send(invalid);
      expect(response.status).toBe(400);
    }
  });

  it('keeps two sign-ins in two tabs apart, and answers 410 to an unknown one', async () => {
    const browser = agent();
    const first = await authorize(browser);
    const second = await authorize(
      browser,
      'other',
      'http://other.test/callback',
    );

    // Each interaction cookie is limited to its own path, so both still work.
    const firstDetails = await browser.get(
      `/api/interaction/${interactionUid(first.location)}/details`,
    );
    const secondDetails = await browser.get(
      `/api/interaction/${interactionUid(second.location)}/details`,
    );
    expect(firstDetails.body.client.id).toBe('app');
    expect(secondDetails.body.client.id).toBe('other');

    const unknown = await browser.get('/api/interaction/unknown-uid/details');
    expect(unknown.status).toBe(410);

    const noCookie = await request(testApp.app.getHttpServer()).get(
      `/api/interaction/${interactionUid(second.location)}/details`,
    );
    expect(noCookie.status).toBe(410);
  });

  it('goes back to the app with access_denied when the person gives up', async () => {
    const browser = agent();
    const { location } = await authorize(browser);

    const response = await browser.post(
      `/api/interaction/${interactionUid(location)}/abort`,
    );
    expect(response.status).toBe(200);
    const back = await followToApp(browser, response.body.redirectTo as string);
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('code')).toBeNull();
  });

  it('refuses a sign-in posted from another site (CSRF)', async () => {
    const browser = agent();
    const { location } = await authorize(browser);

    const response = await browser
      .post(`/api/interaction/${interactionUid(location)}/register`)
      .set('Origin', 'https://evil.test')
      .send(newAccount());
    expect(response.status).toBe(403);

    const sameSite = await browser
      .post(`/api/interaction/${interactionUid(location)}/register`)
      .set('Origin', PUBLIC_URL)
      .send(newAccount());
    expect(sameSite.status).toBe(200);
  });

  it('passes the language the app asked for to the sign-in page', async () => {
    const browser = agent();
    const { location } = await authorize(browser, 'app', undefined, {
      ui_locales: 'pt-BR fr-BE en',
      login_hint: 'jamie',
    });

    const details = await browser.get(
      `/api/interaction/${interactionUid(location)}/details`,
    );
    expect(details.body).toMatchObject({ locale: 'fr', loginHint: 'jamie' });
  });

  it('refuses a token request without the PKCE verifier', async () => {
    const browser = agent();
    const { code } = await signUpThroughApp(browser);

    const response = await exchangeCode(
      testApp.app,
      code,
      'wrong-verifier-'.repeat(4),
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_grant');
    expect(response.body.id_token).toBeUndefined();
  });
});
