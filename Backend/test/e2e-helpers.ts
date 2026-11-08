import type { INestApplication } from '@nestjs/common';
import {
  Test,
  type TestingModule,
  type TestingModuleBuilder,
} from '@nestjs/testing';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import type { App } from 'supertest/types';
import { configureApp } from '../src/app.config';
import { AppModule } from '../src/app.module';
import { createTestDatabase } from '../src/database/testing/test-database';
import type { ClientEntry } from '../src/oidc/clients';

/** The public address the tests pretend the site has; nothing listens there. */
export const PUBLIC_URL = 'http://auth.test';
export const ISSUER = `${PUBLIC_URL}/oidc`;
export const APP_REDIRECT = 'http://app.test/callback';
const APP_HOSTS = new Set(['app.test', 'other.test']);

export const newAccount = (name = `user${randomBytes(4).toString('hex')}`) => ({
  username: name,
  email: `${name}@example.test`,
  password: 'correct horse battery',
  givenName: 'Jamie',
  familyName: 'Doe',
  acceptedTerms: true,
  locale: 'en',
});

export interface ReceivedRequest {
  path: string;
  contentType: string;
  body: string;
}

/** A stand-in for an app's back-channel endpoints: records what it receives. */
export interface Receiver {
  url: string;
  received: ReceivedRequest[];
  /** The status the next requests get (200 by default). */
  status: number;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function startReceiver(): Promise<Receiver> {
  const receiver: Receiver = {
    url: '',
    received: [],
    status: 200,
    close: () => Promise.resolve(),
  };
  const server: Server = createServer((req, res) => {
    void readBody(req).then((body) => {
      receiver.received.push({
        path: req.url ?? '',
        contentType: req.headers['content-type'] ?? '',
        body,
      });
      res.writeHead(receiver.status).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  receiver.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  receiver.close = () =>
    new Promise((resolve) => server.close(() => resolve()));
  return receiver;
}

/** The clients the tests register: a confidential app and the account page. */
export function testClients(receiverUrl: string): ClientEntry[] {
  return [
    {
      client_id: 'account',
      client_name: 'Compte Synapse',
      token_endpoint_auth_method: 'none',
      redirect_uris: [`${PUBLIC_URL}/api/account/callback`],
    },
    {
      client_id: 'app',
      client_name: 'Test App',
      client_uri: 'http://app.test',
      client_secret: 'app-secret',
      redirect_uris: [APP_REDIRECT],
      post_logout_redirect_uris: ['http://app.test/'],
      backchannel_logout_uri: `${receiverUrl}/backchannel-logout`,
      account_deletion_uri: `${receiverUrl}/account-deleted`,
    },
    {
      client_id: 'other',
      client_name: 'Other App',
      client_uri: 'http://other.test',
      client_secret: 'other-secret',
      redirect_uris: ['http://other.test/callback'],
    },
  ];
}

export type ModuleOverrides = (
  builder: TestingModuleBuilder,
) => TestingModuleBuilder;

export interface TestApp {
  app: INestApplication<App>;
  close(): Promise<void>;
}

/** The real AppModule with the runtime HTTP setup, on a throwaway database. */
export async function createTestApp(
  clients: ClientEntry[],
  overrides: ModuleOverrides = (builder) => builder,
): Promise<TestApp> {
  const database = await createTestDatabase();
  const clientsFile = join(tmpdir(), `clients-${randomUUID()}.json`);
  writeFileSync(clientsFile, JSON.stringify(clients));
  process.env.DATABASE_URL = database.url;
  process.env.PUBLIC_URL = PUBLIC_URL;
  process.env.OIDC_CLIENTS_FILE = clientsFile;
  process.env.AUTH_SCRYPT_COST = '1024';
  process.env.AUTH_SCRYPT_PARALLELIZATION = '1';
  // Every test signs in from the same address; rate-limits.e2e-spec.ts checks the limit.
  process.env.AUTH_RATE_LIMIT_PER_MINUTE ??= '1000';

  const moduleFixture: TestingModule = await overrides(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>({
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  return {
    app,
    close: async () => {
      await app.close();
      await database.drop();
    },
  };
}

/** The path and query of an absolute URL the provider returned. */
export function pathOf(url: string): string {
  const parsed = new URL(url, PUBLIC_URL);
  return `${parsed.pathname}${parsed.search}`;
}

export interface Authorization {
  verifier: string;
  /** Where the provider sent the browser. */
  location: string;
}

/** Starts a sign-in for an app, as the app's redirect would. */
export async function authorize(
  agent: TestAgent,
  clientId = 'app',
  redirectUri = APP_REDIRECT,
  extra: Record<string, string> = {},
): Promise<Authorization> {
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid profile email',
    redirect_uri: redirectUri,
    state: 'state-1',
    nonce: 'nonce-1',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    ...extra,
  });
  const response = await agent.get(`/oidc/auth?${params.toString()}`);
  expect(response.status).toBe(303);
  return { verifier, location: response.headers.location };
}

/** The interaction uid in /api/interaction/:uid. */
export function interactionUid(location: string): string {
  const match = /^\/api\/interaction\/([^/?]+)$/.exec(location);
  if (!match) throw new Error(`Not an interaction address: ${location}`);
  return match[1];
}

/**
 * Follows the provider's redirects from `location` until they leave for the
 * app, and returns that last address (the app's redirect_uri with a code).
 */
export async function followToApp(
  agent: TestAgent,
  location: string,
): Promise<URL> {
  let next = location;
  for (let hop = 0; hop < 5; hop++) {
    const url = new URL(next, PUBLIC_URL);
    // The provider builds its own addresses from the request's host (the test
    // server's): only the apps' addresses end the walk.
    if (APP_HOSTS.has(url.host)) return url;
    const response = await agent.get(pathOf(next));
    expect([302, 303]).toContain(response.status);
    next = response.headers.location;
  }
  throw new Error('Too many redirects');
}

/** Signs up through the app's sign-in and returns the code it receives. */
export async function signUpThroughApp(
  agent: TestAgent,
  account = newAccount(),
): Promise<{ code: string; verifier: string }> {
  const { verifier, location } = await authorize(agent);
  const uid = interactionUid(location);
  const registered = await agent
    .post(`/api/interaction/${uid}/register`)
    .send(account);
  expect(registered.status).toBe(200);
  const back = await followToApp(agent, registered.body.redirectTo as string);
  const code = back.searchParams.get('code');
  if (!code) throw new Error(`No code in ${back.toString()}`);
  return { code, verifier };
}

export async function exchangeCode(
  app: INestApplication<App>,
  code: string,
  verifier: string,
  client: { id: string; secret: string } = { id: 'app', secret: 'app-secret' },
): Promise<request.Response> {
  return request(app.getHttpServer())
    .post('/oidc/token')
    .auth(client.id, client.secret)
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: APP_REDIRECT,
    });
}

/** The claims of a JWT, unchecked: signature checks are separate. */
export function claimsOf(jwt: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

export async function waitFor(
  condition: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Polls an async check until it holds, for work the service finishes in the background. */
export async function eventually(
  check: () => Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
