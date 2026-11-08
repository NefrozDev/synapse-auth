import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ClientEntry, loadClients } from './clients';

function fileWith(entries: unknown): string {
  const file = join(tmpdir(), `clients-${randomUUID()}.json`);
  writeFileSync(file, JSON.stringify(entries));
  return file;
}

const app: ClientEntry = {
  client_id: 'app',
  client_name: 'App',
  client_uri: 'https://app.example',
  redirect_uris: ['https://app.example/callback'],
  client_secret_env: 'APP_SECRET',
  backchannel_logout_uri: 'https://app.example/logout',
  account_deletion_uri: 'https://app.example/deleted',
};

describe('loadClients', () => {
  it('reads secrets from the variables the file names, and asks for session ids on logout', () => {
    const [client] = loadClients(fileWith([app]), { APP_SECRET: ' s3cret ' });

    expect(client).toEqual({
      client_id: 'app',
      client_name: 'App',
      client_uri: 'https://app.example',
      client_secret: 's3cret',
      redirect_uris: ['https://app.example/callback'],
      post_logout_redirect_uris: [],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      backchannel_logout_uri: 'https://app.example/logout',
      backchannel_logout_session_required: true,
      account_deletion_uri: 'https://app.example/deleted',
    });
  });

  it('refuses to start when a named secret variable is missing or blank', () => {
    expect(() => loadClients(fileWith([app]), {})).toThrow(
      'Client app: APP_SECRET is not set.',
    );
    expect(() => loadClients(fileWith([app]), { APP_SECRET: '  ' })).toThrow(
      'APP_SECRET is not set',
    );
  });

  it('gives a browser-only app no secret', () => {
    const [client] = loadClients(
      fileWith([
        {
          client_id: 'spa',
          client_name: 'SPA',
          redirect_uris: ['https://spa.example/'],
          token_endpoint_auth_method: 'none',
        },
      ]),
      {},
    );

    expect(client.token_endpoint_auth_method).toBe('none');
    expect(client).not.toHaveProperty('client_secret');
  });

  it.each([
    [
      [{ ...app, client_secret_env: undefined }],
      'needs a secret or must be public',
    ],
    [[{ ...app, redirect_uris: [] }], 'Every client needs'],
    [
      [{ ...app, account_deletion_uri: 'javascript:alert(1)' }],
      'is not an http(s) URL',
    ],
    [[app, app], 'lists a client_id twice'],
    [{ not: 'an array' }, 'must hold an array'],
  ])('refuses an invalid file (%#)', (entries, message) => {
    expect(() => loadClients(fileWith(entries), { APP_SECRET: 'x' })).toThrow(
      message,
    );
  });
});
