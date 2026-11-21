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
        proc.kill('SIGKILL');
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

/**
 * Build the error for a CLI that exited non-zero without emitting a parsable
 * result. Without this the raw stdout (often a plain-text failure notice) would
 * be forwarded to the user as if it were the model's answer.
 */
export function buildCliFailure(
  apiName: string,
  code: number | null,
  stderr: string,
  stdout: string
): Error {
  const detail = (stderr.trim() || stdout.trim()).slice(0, 500);
  return new Error(
    `${apiName} 執行失敗 (exit code: ${code ?? 'unknown'})${detail ? `\n${detail}` : ''}`
  );
}
