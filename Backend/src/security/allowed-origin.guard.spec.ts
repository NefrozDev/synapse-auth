import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { AllowedOriginGuard } from './allowed-origin.guard';

function contextFor(
  method: string,
  headers: Record<string, string>,
): ExecutionContext {
  const request = {
    method,
    get: (name: string) => headers[name.toLowerCase()],
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AllowedOriginGuard', () => {
  const guard = new AllowedOriginGuard({
    publicOrigin: 'https://auth.example',
  } as AppConfig);

  it('lets reads through from anywhere', () => {
    expect(
      guard.canActivate(contextFor('GET', { origin: 'https://evil.test' })),
    ).toBe(true);
  });

  it('lets through writes from the site itself, or with no Origin nor Referer', () => {
    expect(
      guard.canActivate(contextFor('POST', { origin: 'https://auth.example' })),
    ).toBe(true);
    expect(
      guard.canActivate(
        contextFor('DELETE', { referer: 'https://auth.example/account' }),
      ),
    ).toBe(true);
    expect(guard.canActivate(contextFor('POST', {}))).toBe(true);
  });

  it('refuses writes sent by another site', () => {
    expect(() =>
      guard.canActivate(contextFor('POST', { origin: 'https://evil.test' })),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        contextFor('PUT', { referer: 'https://evil.test/page' }),
      ),
    ).toThrow(ForbiddenException);
  });
});
