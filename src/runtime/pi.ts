import { spawn } from 'child_process';
import * as path from 'path';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';
import { createRateLimitState, waitForRateLimit, setupProcessTimeout, checkRateLimitError } from '../utils/runtime.js';

// Path to the compiled approval extension (same dist/ dir as hook bridges)
const APPROVAL_EXTENSION_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../dist/pi-approval-extension.js'
);

export class PiRuntime implements AiRuntime {
  readonly name = 'pi';

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

    const args = ['-p', prompt, '-e', APPROVAL_EXTENSION_PATH, '--no-session'];

    if (sessionId) {
      args.push('--session', sessionId);
      logger.info(`Using session: ${sessionId}`);
    }

    logger.info(`Executing pi: -p ${prompt.slice(0, 50)}...`);

    return new Promise((resolve, reject) => {
      const proc = spawn('pi', args, {
        cwd: actualWorkDir,
        env: process.env,
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
        logger.debug(`pi stderr: ${data.toString().slice(0, 200)}`);
      });

      const timeoutMs = 600000;

      const { clear: clearTimeout } = setupProcessTimeout(proc, timeoutMs, 'Pi', () => {
        reject(new Error(`Pi execution timeout (${timeoutMs / 1000} seconds)`));
      });

      proc.on('close', (code) => {
        clearTimeout();

        const rateLimitError = checkRateLimitError(stderr, 'Pi');
        if (rateLimitError) {
          reject(new Error(rateLimitError));
          return;
        }

        if (code !== 0) {
          logger.warn(`pi exited with code ${code}`);
          reject(new Error(`Pi 執行失敗 (exit code: ${code})\n${stderr.slice(0, 500)}`));
          return;
        }

        resolve({
          stdout: stdout.trim(),
          stderr,
          sessionId,
        });
      });

      proc.on('error', (err) => {
        clearTimeout();
        reject(err);
      });
    });
  }

  needsApproval(toolCall: ToolCall): boolean {
    const autoApproveTools = ['read', 'grep', 'find', 'ls'];
    return !autoApproveTools.includes(toolCall.name);
  }
}
