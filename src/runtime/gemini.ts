import { spawn } from 'child_process';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';
import { createRateLimitState, waitForRateLimit, setupProcessTimeout, checkRateLimitError } from '../utils/runtime.js';

export class GeminiCodeRuntime implements AiRuntime {
  readonly name = 'gemini';

  private rateLimitState = createRateLimitState();

  constructor(private workDir: string) {}

  async execute(
    prompt: string,
    _workDir: string,
    sessionId?: string,
    _imagePaths?: string[]
  ): Promise<RuntimeOutput> {
    await waitForRateLimit(this.rateLimitState);

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

      const { clear: clearTimeout } = setupProcessTimeout(proc, timeoutMs, 'Gemini', () => {
        reject(new Error(`Gemini execution timeout (${timeoutMs / 1000} seconds)`));
      });

      proc.on('close', (code) => {
        clearTimeout();

        const rateLimitError = checkRateLimitError(stderr, 'Gemini');
        if (rateLimitError) {
          reject(new Error(rateLimitError));
          return;
        }

        if (code !== 0) {
          logger.warn(`Gemini exited with code ${code}`);
          reject(new Error(`Gemini 執行失敗 (exit code: ${code})\n${stderr.slice(0, 500)}`));
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
        clearTimeout();
        reject(err);
      });
    });
  }

  needsApproval(toolCall: ToolCall): boolean {
    const autoApproveTools = ['Read', 'Glob', 'Grep', 'Search', 'WebFetch'];
    return !autoApproveTools.includes(toolCall.name);
  }
}
