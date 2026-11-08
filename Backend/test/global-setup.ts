import { PostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Starts one throwaway PostgreSQL server for the whole Vitest run. Each test
 * bed then creates its own database on it (see createTestDatabase).
 * A TEST_DATABASE_URL set beforehand, e.g. by CI, is used instead.
 *
 * Vitest runs this in the main process before starting the test workers, which
 * inherit the environment variable. The returned function is the teardown.
 */
export default async function startPostgres(): Promise<
  (() => Promise<void>) | undefined
> {
  if (process.env.TEST_DATABASE_URL) {
    return undefined;
  }

  const container = await new PostgreSqlContainer('postgres:18-alpine')
    // Durability is pointless for throwaway data and slows every test down.
    .withCommand(['postgres', '-c', 'fsync=off'])
    .start();
  process.env.TEST_DATABASE_URL = container.getConnectionUri();

  return async () => {
    await container.stop();
  };
}
