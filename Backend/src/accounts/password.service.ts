import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const HASH_VERSION = 1;
const KEY_LENGTH = 64;
const DEFAULT_COST = 32_768;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELIZATION = 3;
const MINIMUM_COST = 1_024;
const MAXIMUM_COST = 1_048_576;
const MAXIMUM_BLOCK_SIZE = 32;
const MAXIMUM_PARALLELIZATION = 16;

interface ScryptParameters {
  cost: number;
  blockSize: number;
  parallelization: number;
}

interface ParsedPasswordHash extends ScryptParameters {
  salt: Buffer;
  digest: Buffer;
}

function readBoundedInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

function isValidCost(cost: number): boolean {
  return (
    Number.isSafeInteger(cost) &&
    cost >= MINIMUM_COST &&
    cost <= MAXIMUM_COST &&
    (cost & (cost - 1)) === 0
  );
}

function deriveKey(
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
): Promise<Buffer> {
  const minimumMemory =
    128 * parameters.cost * parameters.blockSize +
    128 * parameters.blockSize * parameters.parallelization;

  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: Math.max(64 * 1024 * 1024, minimumMemory + 1024 * 1024),
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function parsePasswordHash(encodedHash: string): ParsedPasswordHash | null {
  const [algorithm, version, cost, blockSize, parallelization, salt, digest] =
    encodedHash.split('$');

  if (algorithm !== 'scrypt' || Number(version) !== HASH_VERSION) {
    return null;
  }

  const parsed: ParsedPasswordHash = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
    salt: Buffer.from(salt ?? '', 'base64url'),
    digest: Buffer.from(digest ?? '', 'base64url'),
  };

  if (
    !isValidCost(parsed.cost) ||
    !Number.isSafeInteger(parsed.blockSize) ||
    parsed.blockSize <= 0 ||
    parsed.blockSize > MAXIMUM_BLOCK_SIZE ||
    !Number.isSafeInteger(parsed.parallelization) ||
    parsed.parallelization <= 0 ||
    parsed.parallelization > MAXIMUM_PARALLELIZATION ||
    parsed.salt.length < 16 ||
    parsed.digest.length !== KEY_LENGTH
  ) {
    return null;
  }

  return parsed;
}

@Injectable()
export class PasswordService {
  private readonly parameters: ScryptParameters;
  private readonly dummyHash: string;

  constructor(config: ConfigService) {
    this.parameters = {
      cost: readBoundedInteger(
        config.get<string>('AUTH_SCRYPT_COST'),
        'AUTH_SCRYPT_COST',
        DEFAULT_COST,
        MINIMUM_COST,
        MAXIMUM_COST,
      ),
      blockSize: readBoundedInteger(
        config.get<string>('AUTH_SCRYPT_BLOCK_SIZE'),
        'AUTH_SCRYPT_BLOCK_SIZE',
        DEFAULT_BLOCK_SIZE,
        1,
        MAXIMUM_BLOCK_SIZE,
      ),
      parallelization: readBoundedInteger(
        config.get<string>('AUTH_SCRYPT_PARALLELIZATION'),
        'AUTH_SCRYPT_PARALLELIZATION',
        DEFAULT_PARALLELIZATION,
        1,
        MAXIMUM_PARALLELIZATION,
      ),
    };
    if (!isValidCost(this.parameters.cost)) {
      throw new Error('AUTH_SCRYPT_COST must be a power of two.');
    }
    this.dummyHash = this.encodeHash(
      Buffer.alloc(16),
      Buffer.alloc(KEY_LENGTH),
      this.parameters,
    );
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const digest = await deriveKey(password, salt, this.parameters);

    return this.encodeHash(salt, digest, this.parameters);
  }

  async verify(password: string, encodedHash?: string): Promise<boolean> {
    const parsed = parsePasswordHash(encodedHash ?? this.dummyHash);

    if (!parsed) {
      // Keep malformed stored hashes from becoming a fast authentication path.
      await deriveKey(password, Buffer.alloc(16), this.parameters);
      return false;
    }

    const actual = await deriveKey(password, parsed.salt, parsed);

    return (
      actual.length === parsed.digest.length &&
      timingSafeEqual(actual, parsed.digest)
    );
  }

  private encodeHash(
    salt: Buffer,
    digest: Buffer,
    parameters: ScryptParameters,
  ): string {
    return [
      'scrypt',
      HASH_VERSION,
      parameters.cost,
      parameters.blockSize,
      parameters.parallelization,
      salt.toString('base64url'),
      digest.toString('base64url'),
    ].join('$');
  }
}
