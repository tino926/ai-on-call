import { describe, it, expect } from 'vitest';
import { retryWithBackoff, isRateLimitError, RETRY_DEFAULTS } from '../src/utils/retry.js';

describe('isRateLimitError', () => {
  it('should detect rate limit keywords', () => {
    expect(isRateLimitError('rate limit exceeded')).toBe(true);
    expect(isRateLimitError('too many requests')).toBe(true);
    expect(isRateLimitError('HTTP 429')).toBe(true);
    expect(isRateLimitError('quota exceeded')).toBe(true);
    expect(isRateLimitError('request limit reached')).toBe(true);
    expect(isRateLimitError('throttling')).toBe(true);
    expect(isRateLimitError('請求過於頻繁')).toBe(true);
  });

  it('should return false for non-rate-limit errors', () => {
    expect(isRateLimitError('timeout')).toBe(false);
    expect(isRateLimitError('permission denied')).toBe(false);
    expect(isRateLimitError('')).toBe(false);
  });
});

describe('retryWithBackoff', () => {
  it('should succeed on first attempt if no error', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on rate limit error and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce('ok');

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('rate limit'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 }),
    ).rejects.toThrow('rate limit');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-rate-limit errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('internal error'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 }),
    ).rejects.toThrow('internal error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should use default options when none provided', async () => {
    expect(RETRY_DEFAULTS.maxRetries).toBe(3);
    expect(RETRY_DEFAULTS.baseDelayMs).toBe(5000);
    expect(RETRY_DEFAULTS.maxDelayMs).toBe(60000);

    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('ok');
  });
});
