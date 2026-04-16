import { spawn } from 'child_process';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';

export class GeminiCodeRuntime implements AiRuntime {
  readonly name = 'gemini';

  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL_MS = 5000;

  constructor(private workDir: string) {}

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL_MS) {
      const waitTime = this.MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
      logger.info(`Rate limiting: waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  async execute(
    prompt: string,
    _workDir: string,
    sessionId?: string,
    _imagePath?: string
  ): Promise<RuntimeOutput> {
    await this.waitForRateLimit();

    const actualWorkDir = _workDir || this.workDir;

    const args = ['-p', prompt, '--output-format', 'json'];

    if (sessionId) {
      args.push('-r', sessionId);
      logger.info(`Using session: ${sessionId}`);
    }

    logger.info(`Executing Gemini: ${prompt.slice(0, 50)}...`);
    logger.info(`Setting TELEGRAM_BOT_HOOK=1 for hook approval`);

    return new Promise((resolve, reject) => {
      const proc = spawn('gemini', args, {
        cwd: actualWorkDir,
        env: {
          ...process.env,
          TELEGRAM_BOT_HOOK: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.debug(`Gemini stderr: ${data.toString().slice(0, 200)}`);
      });

      const timeoutMs = 600000;

      const timeoutId = setTimeout(() => {
        logger.warn(`Gemini execution timeout after ${timeoutMs}ms`);
        try {
          if (proc.pid) {
            process.kill(-proc.pid, 'SIGKILL');
          }
        } catch (e) {
          // Ignore errors
        }
        reject(new Error(`Gemini execution timeout (${timeoutMs / 1000} seconds)`));
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timeoutId);

        const rateLimitKeywords = [
          'rate limit',
          'too many requests',
          '429',
          'quota exceeded',
          'request limit',
          'throttl',
        ];

        const stderrLower = stderr.toLowerCase();
        const isRateLimitError = rateLimitKeywords.some(keyword =>
          stderrLower.includes(keyword)
        );

        if (isRateLimitError) {
          logger.warn('Rate limit detected');
          reject(new Error('⚠️ Gemini API 請求過於頻繁，請稍後再試（建議等待 1-2 分鐘）'));
          return;
        }

        let result = stdout.trim();
        let newSessionId: string | undefined;

        try {
          const json = JSON.parse(stdout);
          if (json.response) {
            result = json.response;
          }
          if (json.session_id) {
            newSessionId = json.session_id;
          }
        } catch {
          // Not JSON, use raw output
        }

        resolve({
          stdout: result,
          stderr,
          sessionId: newSessionId || sessionId,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  needsApproval(toolCall: ToolCall): boolean {
    const autoApproveTools = ['Read', 'Glob', 'Grep', 'Search', 'WebFetch'];
    return !autoApproveTools.includes(toolCall.name);
  }
}
