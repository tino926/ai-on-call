import { ChildProcess } from 'child_process';
import { logger } from './logger.js';
import { isRateLimitError } from './retry.js';

export interface RateLimitState {
  lastRequestTime: number;
  minIntervalMs: number;
}

export function createRateLimitState(minIntervalMs = 5000): RateLimitState {
  return { lastRequestTime: 0, minIntervalMs };
}

export async function waitForRateLimit(state: RateLimitState): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - state.lastRequestTime;

  if (timeSinceLastRequest < state.minIntervalMs) {
    const waitTime = state.minIntervalMs - timeSinceLastRequest;
    logger.info(`Rate limiting: waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  state.lastRequestTime = Date.now();
}

export function setupProcessTimeout(
  proc: ChildProcess,
  timeoutMs: number,
  name: string,
  onTimeout: () => void
): { clear: () => void } {
  const timeoutId = setTimeout(() => {
    logger.warn(`${name} execution timeout after ${timeoutMs}ms`);
    try {
      if (proc.pid) {
        process.kill(-proc.pid, 'SIGKILL');
      }
    } catch {
      // Process may already be dead
    }
    onTimeout();
  }, timeoutMs);

  return { clear: () => clearTimeout(timeoutId) };
}

export function checkRateLimitError(stderr: string, apiName: string): string | null {
  if (isRateLimitError(stderr)) {
    logger.warn('Rate limit detected');
    return `⚠️ ${apiName} API 請求過於頻繁，請稍後再試（建議等待 1-2 分鐘）`;
  }
  return null;
}
