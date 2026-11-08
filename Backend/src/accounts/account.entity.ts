import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Locale } from './locales';

/**
 * One person, shared by every Synapse app. Its id is the OpenID Connect
 * subject the apps store; Plano's accounts kept their ids when they moved here.
 */
@Entity({ name: 'accounts' })
export class Account {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 30 })
  username: string;

  @Column({ name: 'normalized_username', type: 'varchar', length: 30 })
  normalizedUsername: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ name: 'normalized_email', type: 'varchar', length: 254 })
  normalizedEmail: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash: string;

  @Column({ name: 'given_name', type: 'varchar', length: 80 })
  givenName: string;

  @Column({ name: 'family_name', type: 'varchar', length: 80 })
  familyName: string;

  @Column({ type: 'varchar', length: 8, default: 'fr' })
  locale: Locale;

  @Column({ name: 'terms_accepted_at', type: 'timestamptz' })
  termsAcceptedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
