import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** An app still to tell that an account was deleted. */
@Entity({ name: 'account_deletion_notices' })
export class AccountDeletionNotice {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'account_id', type: 'varchar', length: 36 })
  accountId: string;

  @Column({ name: 'client_id', type: 'varchar', length: 100 })
  clientId: string;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz' })
  nextAttemptAt: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
