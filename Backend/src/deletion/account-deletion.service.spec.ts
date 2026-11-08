import { retryDelayMinutes } from './account-deletion.service';

describe('retryDelayMinutes', () => {
  it('doubles after each failure, up to six hours', () => {
    expect([1, 2, 3, 4, 9, 10, 50].map(retryDelayMinutes)).toEqual([
      1, 2, 4, 8, 256, 360, 360,
    ]);
  });
});
