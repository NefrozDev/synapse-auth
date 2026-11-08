import { randomUUID } from 'node:crypto';
import type { Adapter } from 'oidc-provider';
import {
  createMigratedDataSource,
  type MigratedTestDatabase,
} from '../database/testing/test-database';
import { deleteExpiredPayloads, postgresAdapter } from './postgres-adapter';

describe('postgresAdapter', () => {
  let database: MigratedTestDatabase;
  let sessions: Adapter;
  let tokens: Adapter;
  let accountId: string;

  beforeAll(async () => {
    database = await createMigratedDataSource();
    const Adapter = postgresAdapter(database.dataSource);
    sessions = new Adapter('Session');
    tokens = new Adapter('AccessToken');
    accountId = randomUUID();
    await database.dataSource.query(
      `INSERT INTO accounts (id, username, normalized_username, email, normalized_email,
         password_hash, given_name, family_name, terms_accepted_at)
       VALUES ($1, 'jamie', 'jamie', 'j@example.test', 'j@example.test', 'x', 'J', 'D', now())`,
      [accountId],
    );
  });

  afterAll(() => database.close());

  it('stores, replaces and finds a payload by id and uid, per model', async () => {
    await sessions.upsert('s1', { uid: 'u1', accountId }, 60);
    await sessions.upsert('s1', { uid: 'u1', accountId, kind: 'Session' }, 60);

    expect(await sessions.find('s1')).toEqual({
      uid: 'u1',
      accountId,
      kind: 'Session',
    });
    expect(await sessions.findByUid('u1')).toMatchObject({ kind: 'Session' });
    expect(await tokens.find('s1')).toBeUndefined();
    const [{ account_id }] = await database.dataSource.query(
      `SELECT account_id FROM oidc_payloads WHERE model = 'Session' AND id = 's1'`,
    );
    expect(account_id).toBe(accountId);
  });

  it('marks a consumed payload with the time it was consumed', async () => {
    await tokens.upsert('code1', { grantId: 'g1' }, 60);
    await tokens.consume('code1');

    const found = await tokens.find('code1');
    expect(found?.consumed).toBeGreaterThan(Date.now() / 1000 - 60);
  });

  it('hides and then deletes what has expired', async () => {
    await tokens.upsert('old', { grantId: 'g2' }, 1);
    await database.dataSource.query(
      `UPDATE oidc_payloads SET expires_at = now() - interval '1 second' WHERE id = 'old'`,
    );

    expect(await tokens.find('old')).toBeUndefined();
    expect(
      await deleteExpiredPayloads(database.dataSource),
    ).toBeGreaterThanOrEqual(1);
    const rows = await database.dataSource.query(
      `SELECT id FROM oidc_payloads WHERE id = 'old'`,
    );
    expect(rows).toEqual([]);
  });

  it('revokes everything issued under a grant, in every model', async () => {
    await tokens.upsert('t1', { grantId: 'g3' }, 60);
    await sessions.upsert('t2', { grantId: 'g3' }, 60);
    await tokens.upsert('t3', { grantId: 'other' }, 60);

    await tokens.revokeByGrantId('g3');

    expect(await tokens.find('t1')).toBeUndefined();
    expect(await sessions.find('t2')).toBeUndefined();
    expect(await tokens.find('t3')).toBeDefined();
  });

  it('destroys one payload', async () => {
    await sessions.upsert('gone', {}, 60);
    await sessions.destroy('gone');
    expect(await sessions.find('gone')).toBeUndefined();
  });

  it('lets an account deletion take its payloads with it', async () => {
    await sessions.upsert('mine', { accountId }, 60);

    await database.dataSource.query('DELETE FROM accounts WHERE id = $1', [
      accountId,
    ]);

    expect(await sessions.find('mine')).toBeUndefined();
  });
});
