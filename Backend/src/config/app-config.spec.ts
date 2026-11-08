import { ConfigService } from '@nestjs/config';
import { AppConfig } from './app-config';

const configOf = (values: Record<string, string>) =>
  new AppConfig(new ConfigService(values));

describe('AppConfig', () => {
  it('derives the issuer and origin from PUBLIC_URL, without trailing slashes', () => {
    const config = configOf({ PUBLIC_URL: 'https://auth.example//' });

    expect(config.publicUrl).toBe('https://auth.example');
    expect(config.publicOrigin).toBe('https://auth.example');
    expect(config.issuer).toBe('https://auth.example/oidc');
    expect(config.sessionTtlSeconds).toBe(30 * 24 * 60 * 60);
    expect(config.production).toBe(false);
  });

  it('refuses plain http in production', () => {
    expect(() =>
      configOf({ NODE_ENV: 'production', PUBLIC_URL: 'http://auth.example' }),
    ).toThrow('https');
  });

  it.each(['0', '400', '1.5', 'many'])(
    'refuses SESSION_TTL_DAYS=%s',
    (days) => {
      expect(() => configOf({ SESSION_TTL_DAYS: days })).toThrow(
        'SESSION_TTL_DAYS',
      );
    },
  );
});
