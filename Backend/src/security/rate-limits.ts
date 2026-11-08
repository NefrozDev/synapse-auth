const DEFAULT_SENSITIVE_PER_MINUTE = 10;

/**
 * Requests per minute and per client IP on routes that check a password or
 * send an e-mail (AUTH_RATE_LIMIT_PER_MINUTE). Read at each request, so tests
 * can raise it.
 */
export function sensitiveLimitPerMinute(): number {
  const value = Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE);
  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_SENSITIVE_PER_MINUTE;
}

/** For @Throttle() on those routes. */
export const SENSITIVE_THROTTLE = {
  default: { limit: () => sensitiveLimitPerMinute(), ttl: 60_000 },
};
