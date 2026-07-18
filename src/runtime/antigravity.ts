import { spawn } from 'child_process';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';
import { createRateLimitState, waitForRateLimit, setupProcessTimeout, checkRateLimitError } from '../utils/runtime.js';

export class AntigravityRuntime implements AiRuntime {
  readonly name = 'antigravity';

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

    const args = ['-p', prompt];

    if (sessionId) {
      args.push('--conversation', sessionId);
      logger.info(`Using conversation: ${sessionId}`);
    }

    logger.info(`Executing agy: -p ${prompt.slice(0, 50)}...`);

    return new Promise((resolve, reject) => {
      const proc = spawn('agy', args, {
        cwd: actualWorkDir,
        env: {
          ...process.env,
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
        logger.debug(`agy stderr: ${data.toString().slice(0, 200)}`);
      });

      const timeoutMs = 600000;

      const { clear: clearTimeout } = setupProcessTimeout(proc, timeoutMs, 'Antigravity', () => {
        reject(new Error(`Antigravity execution timeout (${timeoutMs / 1000} seconds)`));
      });

      proc.on('close', (code) => {
        clearTimeout();

        const rateLimitError = checkRateLimitError(stderr, 'Antigravity');
        if (rateLimitError) {
          reject(new Error(rateLimitError));
          return;
        }

        if (code !== 0) {
          logger.warn(`agy exited with code ${code}`);
          reject(new Error(`Antigravity 執行失敗 (exit code: ${code})\n${stderr.slice(0, 500)}`));
          return;
        }

        let newSessionId: string | undefined;
        const result = stdout.trim();

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
