import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { Account } from '../../accounts/account.entity';
import { PasswordReset } from '../../password-reset/password-reset.entity';
import { MIGRATIONS } from '../migrations';

/** Every entity, for tests that build a DataSource without the Nest modules. */
export const ENTITIES = [Account, PasswordReset];

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

/**
 * A new, empty database on the PostgreSQL server that Vitest's global setup
 * started, so every test bed starts from a clean schema and tests stay isolated.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set: run the tests through Vitest, whose global setup starts PostgreSQL.',
    );
  }

  const name = `identity_test_${randomUUID().replaceAll('-', '')}`;
  await runOnServer(serverUrl, `CREATE DATABASE "${name}"`);

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: () =>
      runOnServer(serverUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
  };
}

export interface MigratedTestDatabase {
  dataSource: DataSource;
  close(): Promise<void>;
}

/** A migrated throwaway database, for service tests that need real SQL. */
export async function createMigratedDataSource(): Promise<MigratedTestDatabase> {
  const database = await createTestDatabase();
  const dataSource = new DataSource({
    type: 'postgres',
    url: database.url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    poolSize: 2,
  });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'all' });
  return {
    dataSource,
    close: async () => {
      await dataSource.destroy();
      await database.drop();
    },
  };
}

async function runOnServer(serverUrl: string, sql: string): Promise<void> {
  const client = new Client({ connectionString: serverUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
