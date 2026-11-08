import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * A pending password recovery. Only the SHA-256 of the token is stored: a
 * leaked database cannot be used to reset anyone's password.
 */
@Entity({ name: 'password_resets' })
export class PasswordReset {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'account_id', type: 'varchar', length: 36 })
  accountId: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
