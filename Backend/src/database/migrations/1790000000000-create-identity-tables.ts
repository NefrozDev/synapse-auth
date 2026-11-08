import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentityTables1790000000000 implements MigrationInterface {
  name = 'CreateIdentityTables1790000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE accounts (
        id varchar(36) PRIMARY KEY,
        username varchar(30) NOT NULL,
        normalized_username varchar(30) NOT NULL,
        email varchar(254) NOT NULL,
        normalized_email varchar(254) NOT NULL,
        password_hash text NOT NULL,
        given_name varchar(80) NOT NULL,
        family_name varchar(80) NOT NULL,
        locale varchar(8) NOT NULL DEFAULT 'fr',
        terms_accepted_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_accounts_normalized_username ON accounts (normalized_username)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_accounts_normalized_email ON accounts (normalized_email)',
    );

    await queryRunner.query(`
      CREATE TABLE password_resets (
        id varchar(36) PRIMARY KEY,
        account_id varchar(36) NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
        token_hash varchar(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_password_resets_token_hash ON password_resets (token_hash)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_password_resets_account ON password_resets (account_id)',
    );

    // What oidc-provider keeps: sessions, interactions, grants, codes, tokens.
    // account_id is copied out of the payload so the rows of an account can be
    // found, and go with it when it is deleted.
    await queryRunner.query(`
      CREATE TABLE oidc_payloads (
        model varchar(40) NOT NULL,
        id varchar(255) NOT NULL,
        payload jsonb NOT NULL,
        grant_id varchar(255),
        user_code varchar(255),
        uid varchar(255),
        account_id varchar(36) REFERENCES accounts (id) ON DELETE CASCADE,
        expires_at timestamptz,
        consumed_at timestamptz,
        PRIMARY KEY (model, id)
      )`);
    await queryRunner.query(
      'CREATE INDEX ix_oidc_payloads_grant ON oidc_payloads (grant_id) WHERE grant_id IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX ix_oidc_payloads_uid ON oidc_payloads (uid) WHERE uid IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX ix_oidc_payloads_account ON oidc_payloads (account_id) WHERE account_id IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX ix_oidc_payloads_expires ON oidc_payloads (expires_at) WHERE expires_at IS NOT NULL',
    );

    // Apps to tell about a deleted account, until each one confirms. No foreign
    // key: the account is gone by then, only its id remains, as the apps know it.
    await queryRunner.query(`
      CREATE TABLE account_deletion_notices (
        id varchar(36) PRIMARY KEY,
        account_id varchar(36) NOT NULL,
        client_id varchar(100) NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      'CREATE INDEX ix_account_deletion_notices_due ON account_deletion_notices (next_attempt_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE account_deletion_notices');
    await queryRunner.query('DROP TABLE oidc_payloads');
    await queryRunner.query('DROP TABLE password_resets');
    await queryRunner.query('DROP TABLE accounts');
  }
}
