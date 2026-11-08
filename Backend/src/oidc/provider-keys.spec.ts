import { generateSigningKey, loadProviderKeys } from './provider-keys';

const cookieKey = 'k'.repeat(32);

describe('loadProviderKeys', () => {
  it('makes throwaway keys in development, and says which', async () => {
    const { keys, generated } = await loadProviderKeys({ production: false });

    expect(generated).toEqual(['OIDC_JWKS', 'OIDC_COOKIE_KEYS']);
    expect(keys.jwks.keys).toHaveLength(1);
    expect(keys.jwks.keys[0]).toMatchObject({
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
    });
    expect(keys.jwks.keys[0].d).toBeTruthy();
    expect(keys.cookieKeys[0].length).toBeGreaterThanOrEqual(32);
  });

  it('requires both settings in production', async () => {
    await expect(
      loadProviderKeys({ production: true, cookieKeys: cookieKey }),
    ).rejects.toThrow('required in production');
  });

  it('uses the given keys as they are', async () => {
    const key = await generateSigningKey();

    const { keys, generated } = await loadProviderKeys({
      production: true,
      jwks: JSON.stringify({ keys: [key] }),
      cookieKeys: `${cookieKey}, ${'n'.repeat(40)}`,
    });

    expect(generated).toEqual([]);
    expect(keys.jwks.keys).toEqual([key]);
    expect(keys.cookieKeys).toEqual([cookieKey, 'n'.repeat(40)]);
  });

  it.each([
    ['not json', 'not valid JSON'],
    ['{"keys":[]}', 'private RSA keys'],
    ['{"keys":[{"kty":"RSA","n":"x","e":"AQAB"}]}', 'private RSA keys'],
  ])('refuses OIDC_JWKS %s', async (jwks, message) => {
    await expect(
      loadProviderKeys({ production: false, jwks, cookieKeys: cookieKey }),
    ).rejects.toThrow(message);
  });

  it('refuses short cookie secrets', async () => {
    await expect(
      loadProviderKeys({ production: false, cookieKeys: 'short' }),
    ).rejects.toThrow('at least 32 characters');
  });
});
