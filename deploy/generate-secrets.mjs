// Prints fresh secrets for the production .env: node deploy/generate-secrets.mjs
// Uses only Node's crypto, so it runs anywhere Node 24 does, without installing anything.
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...privateKey.export({ format: 'jwk' }),
  kid: randomBytes(8).toString('hex'),
  alg: 'RS256',
  use: 'sig',
};
const hex = (bytes) => randomBytes(bytes).toString('hex');

console.log(`IDENTITY_DB_PASSWORD=${hex(32)}`);
console.log(`OIDC_JWKS=${JSON.stringify({ keys: [jwk] })}`);
console.log(`OIDC_COOKIE_KEYS=${hex(32)}`);
console.log(`PLANO_CLIENT_SECRET=${hex(32)}`);
console.log(`ERUDI_CLIENT_SECRET=${hex(32)}`);
console.log(`SEMVER_SAGE_CLIENT_SECRET=${hex(32)}`);
