import { HttpErrorResponse } from '@angular/common/http';
import { errorField, failureMessage, httpStatus } from './api-errors';

describe('API errors', () => {
  it('should read the status of an HTTP error only', () => {
    expect(httpStatus(new HttpErrorResponse({ status: 409 }))).toBe(409);
    expect(httpStatus(new Error('boom'))).toBeNull();
  });

  it('should read the field a 400 names', () => {
    expect(errorField(new HttpErrorResponse({ status: 400, error: { field: 'password' } }))).toBe(
      'password',
    );
    expect(errorField(new HttpErrorResponse({ status: 400, error: 'text' }))).toBeNull();
    expect(errorField(new HttpErrorResponse({ status: 400, error: { field: 3 } }))).toBeNull();
  });

  it('should explain an unreachable API, a rate limit, and anything else', () => {
    expect(failureMessage(new HttpErrorResponse({ status: 0 }))).toBe('errors.unreachable');
    expect(failureMessage(new HttpErrorResponse({ status: 429 }))).toBe('errors.tooManyAttempts');
    expect(failureMessage(new HttpErrorResponse({ status: 500 }))).toBe('errors.generic');
  });
});
