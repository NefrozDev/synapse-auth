import { randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair, type JWK } from 'jose';

export interface ProviderKeys {
  /** Private signing keys: the provider publishes their public half at /oidc/jwks. */
  jwks: { keys: JWK[] };
  /** Secrets that sign the provider's cookies, newest first. */
  cookieKeys: string[];
}

export interface KeySettings {
  jwks?: string;
  cookieKeys?: string;
  production: boolean;
}

const MIN_COOKIE_KEY_LENGTH = 32;

function parseJwks(value: string): { keys: JWK[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('OIDC_JWKS is not valid JSON.');
  }
  const keys = (parsed as { keys?: unknown })?.keys;
  if (
    !Array.isArray(keys) ||
    keys.length === 0 ||
    !keys.every(
      (key: JWK) =>
        key && typeof key === 'object' && key.kty === 'RSA' && key.d,
    )
  ) {
    throw new Error('OIDC_JWKS must hold private RSA keys: {"keys":[{...}]}.');
  }
  return { keys: keys as JWK[] };
}

function parseCookieKeys(value: string): string[] {
  const keys = value
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  if (
    keys.length === 0 ||
    keys.some((key) => key.length < MIN_COOKIE_KEY_LENGTH)
  ) {
    throw new Error(
      `OIDC_COOKIE_KEYS must list secrets of at least ${MIN_COOKIE_KEY_LENGTH} characters.`,
    );
  }
  return keys;
}

/** A new RSA signing key, for development and for `npm run keys`. */
export async function generateSigningKey(): Promise<JWK> {
  const { privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  });
  return {
    ...(await exportJWK(privateKey)),
    kid: randomBytes(8).toString('hex'),
    alg: 'RS256',
    use: 'sig',
  };
}

/**
 * Production requires both settings. In development, missing ones are made up
 * at start: signed-in sessions and issued tokens then end with each restart.
 */
export async function loadProviderKeys(
  settings: KeySettings,
): Promise<{ keys: ProviderKeys; generated: string[] }> {
  const generated: string[] = [];
  const jwksValue = settings.jwks?.trim();
  const cookieValue = settings.cookieKeys?.trim();

  if (settings.production && (!jwksValue || !cookieValue)) {
    throw new Error(
      'OIDC_JWKS and OIDC_COOKIE_KEYS are required in production.',
    );
  }

  let jwks: { keys: JWK[] };
  if (jwksValue) {
    jwks = parseJwks(jwksValue);
  } else {
    jwks = { keys: [await generateSigningKey()] };
    generated.push('OIDC_JWKS');
  }

  let cookieKeys: string[];
  if (cookieValue) {
    cookieKeys = parseCookieKeys(cookieValue);
  } else {
    cookieKeys = [randomBytes(32).toString('base64url')];
    generated.push('OIDC_COOKIE_KEYS');
  }

  return { keys: { jwks, cookieKeys }, generated };
}
