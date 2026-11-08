import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_PUBLIC_URL = 'http://localhost:4300';
const DEFAULT_SESSION_TTL_DAYS = 30;

export function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}

function readSessionDays(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_SESSION_TTL_DAYS;
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
    throw new Error('SESSION_TTL_DAYS must be an integer between 1 and 365.');
  }
  return days;
}

/** The settings every part of the service reads, checked once at start. */
@Injectable()
export class AppConfig {
  readonly production: boolean;
  /** The address people open, e.g. https://auth.synapseengineering.dev. */
  readonly publicUrl: string;
  readonly publicOrigin: string;
  /** The OpenID Connect issuer: the provider is mounted under /oidc. */
  readonly issuer: string;
  readonly sessionTtlSeconds: number;

  constructor(config: ConfigService) {
    this.production = config.get<string>('NODE_ENV') === 'production';
    const publicUrl = withoutTrailingSlashes(
      config.get<string>('PUBLIC_URL')?.trim() || DEFAULT_PUBLIC_URL,
    );
    const parsed = new URL(publicUrl);
    if (this.production && parsed.protocol !== 'https:') {
      throw new Error('PUBLIC_URL must use https in production.');
    }
    this.publicUrl = publicUrl;
    this.publicOrigin = parsed.origin;
    this.issuer = `${publicUrl}/oidc`;
    this.sessionTtlSeconds =
      readSessionDays(config.get<string>('SESSION_TTL_DAYS')) * 24 * 60 * 60;
  }
}
