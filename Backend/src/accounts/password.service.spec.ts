import { ConfigService } from '@nestjs/config';
import { scrypt } from 'node:crypto';
import { PasswordService } from './password.service';

// ES module imports are live bindings that vi.spyOn cannot replace, so the
// module is mocked instead. vi.mock is hoisted above the imports; the mock
// delegates to the real scrypt unless a test overrides it.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, scrypt: vi.fn(actual.scrypt) };
});

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService(
      new ConfigService({
        AUTH_SCRYPT_COST: '1024',
        AUTH_SCRYPT_BLOCK_SIZE: '8',
        AUTH_SCRYPT_PARALLELIZATION: '1',
      }),
    );
  });

  it('creates salted hashes and verifies the matching password', async () => {
    const firstHash = await service.hash('a sufficiently long password');
    const secondHash = await service.hash('a sufficiently long password');

    expect(firstHash).toMatch(/^scrypt\$1\$1024\$8\$1\$/);
    expect(firstHash).not.toBe(secondHash);
    await expect(
      service.verify('a sufficiently long password', firstHash),
    ).resolves.toBe(true);
  });

  it('rejects wrong passwords and malformed stored hashes', async () => {
    const hash = await service.hash('the correct password');

    await expect(service.verify('the wrong password', hash)).resolves.toBe(
      false,
    );
    await expect(service.verify('anything', 'not-a-valid-hash')).resolves.toBe(
      false,
    );
  });

  it('fails fast for an invalid scrypt cost', () => {
    expect(
      () =>
        new PasswordService(new ConfigService({ AUTH_SCRYPT_COST: '12345' })),
    ).toThrow('AUTH_SCRYPT_COST must be a power of two.');
  });

  it('uses defaults for empty settings and rejects out-of-range ones', () => {
    expect(
      () =>
        new PasswordService(
          new ConfigService({
            AUTH_SCRYPT_BLOCK_SIZE: '',
            AUTH_SCRYPT_COST: '1024',
          }),
        ),
    ).not.toThrow();
    expect(
      () =>
        new PasswordService(
          new ConfigService({ AUTH_SCRYPT_PARALLELIZATION: '99' }),
        ),
    ).toThrow(
      'AUTH_SCRYPT_PARALLELIZATION must be an integer between 1 and 16.',
    );
  });

  it('treats tampered hash parameters as invalid', async () => {
    const [, , , , , salt, digest] = (
      await service.hash('the correct password')
    ).split('$');
    const tampered = [
      `scrypt$2$1024$8$1$${salt}$${digest}`, // unknown version
      `scrypt$1$1024$64$1$${salt}$${digest}`, // block size too large
      `scrypt$1$1024$8$0$${salt}$${digest}`, // no parallelization
      `scrypt$1$1024$8$1$AAAA$${digest}`, // salt too short
      `scrypt$1$1024$8$1$${salt}`, // digest missing
    ];

    for (const hash of tampered) {
      await expect(service.verify('the correct password', hash)).resolves.toBe(
        false,
      );
    }
  });

  it('propagates key derivation failures', async () => {
    const failure = new Error('scrypt failed');
    vi.mocked(scrypt).mockImplementationOnce((...args: unknown[]) => {
      (args.at(-1) as (error: Error | null) => void)(failure);
    });

    await expect(service.hash('a password')).rejects.toBe(failure);
  });
});
