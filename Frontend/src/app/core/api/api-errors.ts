import { HttpErrorResponse } from '@angular/common/http';

/** The HTTP status of a failed call (0 when the API could not be reached), or null. */
export function httpStatus(error: unknown): number | null {
  return error instanceof HttpErrorResponse ? error.status : null;
}

/** The field a 400 names (`field` in the API's error body), if any. */
export function errorField(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body: unknown = error.error;
  if (typeof body !== 'object' || body === null) return null;
  const field = (body as Record<string, unknown>)['field'];
  return typeof field === 'string' ? field : null;
}

/** The translation key for a failure with no more specific explanation. */
export function failureMessage(error: unknown): string {
  switch (httpStatus(error)) {
    case 0:
      return 'errors.unreachable';
    case 429:
      return 'errors.tooManyAttempts';
    default:
      return 'errors.generic';
  }
}
