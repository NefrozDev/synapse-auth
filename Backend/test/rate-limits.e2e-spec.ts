import request from 'supertest';
import {
  authorize,
  createTestApp,
  interactionUid,
  type Receiver,
  startReceiver,
  testClients,
  type TestApp,
} from './e2e-helpers';

describe('Rate limits on password checks', () => {
  let receiver: Receiver;
  let testApp: TestApp;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '3';
    receiver = await startReceiver();
    testApp = await createTestApp(testClients(receiver.url));
  });

  afterAll(async () => {
    delete process.env.AUTH_RATE_LIMIT_PER_MINUTE;
    await testApp.close();
    await receiver.close();
  });

  it('answers 429 once a client guessed too many passwords in a minute', async () => {
    const browser = request.agent(testApp.app.getHttpServer());
    const { location } = await authorize(browser);
    const uid = interactionUid(location);
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await browser
        .post(`/api/interaction/${uid}/login`)
        .send({ login: 'someone', password: `guess ${attempt}` });
      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});
