import request from 'supertest';
import { MailService, type OutgoingMail } from '../src/mail/mail.service';
import {
  authorize,
  createTestApp,
  interactionUid,
  newAccount,
  PUBLIC_URL,
  type Receiver,
  signUpThroughApp,
  startReceiver,
  testClients,
  type TestApp,
  waitFor,
} from './e2e-helpers';

describe('Password recovery', () => {
  let receiver: Receiver;
  let testApp: TestApp;
  const sent: OutgoingMail[] = [];

  beforeAll(async () => {
    receiver = await startReceiver();
    testApp = await createTestApp(testClients(receiver.url), (builder) =>
      builder.overrideProvider(MailService).useValue({
        enabled: true,
        send: (mail: OutgoingMail) => {
          sent.push(mail);
          return Promise.resolve();
        },
      }),
    );
  });

  afterAll(async () => {
    await testApp.close();
    await receiver.close();
  });

  beforeEach(() => {
    sent.length = 0;
    receiver.received.length = 0;
  });

  const api = () => request(testApp.app.getHttpServer());

  function tokenFrom(mail: OutgoingMail): string {
    const match = /\/reset-password#token=([A-Za-z0-9_-]{43})/.exec(mail.text);
    if (!match) throw new Error(`No reset link in: ${mail.text}`);
    return match[1];
  }

  async function signInWith(login: string, password: string): Promise<number> {
    const browser = request.agent(testApp.app.getHttpServer());
    const { location } = await authorize(browser);
    const response = await browser
      .post(`/api/interaction/${interactionUid(location)}/login`)
      .send({ login, password });
    return response.status;
  }

  it('answers 204 for an unknown address, and sends nothing', async () => {
    const response = await api()
      .post('/api/password-reset')
      .send({ email: 'nobody@example.test' });

    expect(response.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).toHaveLength(0);
  });

  it('e-mails a single-use link in the account language, which sets a new password and signs out everywhere', async () => {
    const account = { ...newAccount(), locale: 'fr' };
    const browser = request.agent(testApp.app.getHttpServer());
    await signUpThroughApp(browser, account);
    receiver.received.length = 0;

    const asked = await api()
      .post('/api/password-reset')
      .send({ email: account.email.toUpperCase() });
    expect(asked.status).toBe(204);
    await waitFor(() => sent.length === 1);
    expect(sent[0]).toMatchObject({
      to: account.email,
      subject: 'Réinitialiser votre mot de passe Synapse',
    });
    expect(sent[0].text).toContain(`${PUBLIC_URL}/reset-password#token=`);
    expect(sent[0].text).toContain('30 minutes');
    const token = tokenFrom(sent[0]);

    const confirmed = await api()
      .post('/api/password-reset/confirm')
      .send({ token, password: 'a brand new password' });
    expect(confirmed.status).toBe(204);

    expect(await signInWith(account.username, account.password)).toBe(401);
    expect(await signInWith(account.username, 'a brand new password')).toBe(
      200,
    );
    expect((await browser.get('/api/account')).status).toBe(401);
    expect(receiver.received.map((r) => r.path)).toEqual([
      '/backchannel-logout',
    ]);

    const reused = await api()
      .post('/api/password-reset/confirm')
      .send({ token, password: 'yet another password' });
    expect(reused.status).toBe(400);
    expect(reused.body.message).toBe(
      'This link no longer works. Ask for a new one.',
    );
  });

  it('keeps only the latest link working', async () => {
    const account = newAccount();
    await signUpThroughApp(request.agent(testApp.app.getHttpServer()), account);

    await api().post('/api/password-reset').send({ email: account.email });
    await api().post('/api/password-reset').send({ email: account.email });
    await waitFor(() => sent.length === 2);
    const [first, second] = sent.map(tokenFrom);

    const old = await api()
      .post('/api/password-reset/confirm')
      .send({ token: first, password: 'a brand new password' });
    expect(old.status).toBe(400);
    const latest = await api()
      .post('/api/password-reset/confirm')
      .send({ token: second, password: 'a brand new password' });
    expect(latest.status).toBe(204);
  });

  it('refuses a malformed token or a short password', async () => {
    const malformed = await api()
      .post('/api/password-reset/confirm')
      .send({ token: 'abc', password: 'a brand new password' });
    const short = await api()
      .post('/api/password-reset/confirm')
      .send({ token: 'a'.repeat(43), password: 'short' });

    expect(malformed.status).toBe(400);
    expect(short.status).toBe(400);
  });
});
