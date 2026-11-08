import type { Adapter, AdapterPayload } from 'oidc-provider';
import type { DataSource } from 'typeorm';

interface PayloadRow {
  payload: AdapterPayload;
  consumed_at: Date | null;
}

/** One constant query per lookup column: nothing is spliced into the SQL. */
const SELECT_LIVE = {
  id: 'SELECT payload, consumed_at FROM oidc_payloads WHERE model = $1 AND id = $2 AND (expires_at IS NULL OR expires_at > now())',
  uid: 'SELECT payload, consumed_at FROM oidc_payloads WHERE model = $1 AND uid = $2 AND (expires_at IS NULL OR expires_at > now()) LIMIT 1',
  user_code:
    'SELECT payload, consumed_at FROM oidc_payloads WHERE model = $1 AND user_code = $2 AND (expires_at IS NULL OR expires_at > now()) LIMIT 1',
} as const;

/**
 * oidc-provider's storage (sessions, interactions, grants, codes, tokens) in
 * one PostgreSQL table, keyed by model name and id. The provider creates one
 * adapter per model, so the DataSource is captured by a class per DataSource.
 */
export function postgresAdapter(
  dataSource: DataSource,
): new (model: string) => Adapter {
  return class PostgresAdapter implements Adapter {
    constructor(private readonly model: string) {}

    async upsert(
      id: string,
      payload: AdapterPayload,
      expiresIn?: number,
    ): Promise<void> {
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : null;
      await dataSource.query(
        `INSERT INTO oidc_payloads
           (model, id, payload, grant_id, user_code, uid, account_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (model, id) DO UPDATE SET
           payload = EXCLUDED.payload,
           grant_id = EXCLUDED.grant_id,
           user_code = EXCLUDED.user_code,
           uid = EXCLUDED.uid,
           account_id = EXCLUDED.account_id,
           expires_at = EXCLUDED.expires_at`,
        [
          this.model,
          id,
          JSON.stringify(payload),
          payload.grantId ?? null,
          payload.userCode ?? null,
          payload.uid ?? null,
          payload.accountId ?? null,
          expiresAt,
        ],
      );
    }

    find(id: string): Promise<AdapterPayload | undefined> {
      return this.findBy('id', id);
    }

    findByUid(uid: string): Promise<AdapterPayload | undefined> {
      return this.findBy('uid', uid);
    }

    findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
      return this.findBy('user_code', userCode);
    }

    async consume(id: string): Promise<void> {
      await dataSource.query(
        'UPDATE oidc_payloads SET consumed_at = now() WHERE model = $1 AND id = $2',
        [this.model, id],
      );
    }

    async destroy(id: string): Promise<void> {
      await dataSource.query(
        'DELETE FROM oidc_payloads WHERE model = $1 AND id = $2',
        [this.model, id],
      );
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      // Every model: revoking a grant ends its codes and tokens too.
      await dataSource.query('DELETE FROM oidc_payloads WHERE grant_id = $1', [
        grantId,
      ]);
    }

    private async findBy(
      column: 'id' | 'uid' | 'user_code',
      value: string,
    ): Promise<AdapterPayload | undefined> {
      const rows: PayloadRow[] = await dataSource.query(SELECT_LIVE[column], [
        this.model,
        value,
      ]);
      const row = rows[0];
      if (!row) return undefined;
      return row.consumed_at
        ? {
            ...row.payload,
            consumed: Math.floor(row.consumed_at.getTime() / 1000),
          }
        : row.payload;
    }
  };
}

/** Removes what has expired; run now and then, as nothing else deletes it. */
export async function deleteExpiredPayloads(
  dataSource: DataSource,
): Promise<number> {
  const result: [unknown[], number] = await dataSource.query(
    'DELETE FROM oidc_payloads WHERE expires_at <= now()',
  );
  return result[1];
}
