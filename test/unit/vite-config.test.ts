import { describe, expect, it } from 'vitest';
import { isDevShutdownAuthorized } from '../../vite.config';

describe('dev shutdown middleware guard', () => {
  it('requires a matching token from a loopback address', () => {
    expect(isDevShutdownAuthorized('/__shutdown', '127.0.0.1', 'secret')).toBe(false);
    expect(isDevShutdownAuthorized('/__shutdown?token=wrong', '127.0.0.1', 'secret')).toBe(false);
    expect(isDevShutdownAuthorized('/__shutdown?token=secret', '192.0.2.10', 'secret')).toBe(false);
    expect(isDevShutdownAuthorized('/__shutdown?token=secret', '::1', 'secret')).toBe(true);
  });
});
