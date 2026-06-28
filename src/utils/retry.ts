export const RATE_LIMIT_KEYWORDS = [
  'rate limit',
  'too many requests',
  '429',
  'quota exceeded',
  'request limit',
  'throttl',
  '過於頻繁',
];

export const RETRY_DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 5000,
  maxDelayMs: 60000,
};

export function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return RATE_LIMIT_KEYWORDS.some((k) => lower.includes(k));
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = RETRY_DEFAULTS,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt >= options.maxRetries || !isRateLimitError(error.message)) {
        throw error;
      }
      const delay = Math.min(
        options.baseDelayMs * Math.pow(2, attempt),
        options.maxDelayMs,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError ?? new Error('retryWithBackoff: unexpected exit');
}
