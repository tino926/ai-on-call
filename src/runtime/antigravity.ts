import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';
import { DATA_DIR } from '../utils/paths.js';
import { createRateLimitState, waitForRateLimit, setupProcessTimeout, checkRateLimitError } from '../utils/runtime.js';

// Must match the hook bridge's default (scripts/agy-hook.ts). The runtime passes
// this path to agy via env so the hook writes to the same file in dev and
// global installs.
export function getConversationStatePath(): string {
  return process.env.AI_ON_CALL_CONVERSATION_STATE || path.join(DATA_DIR, 'agy-conversation-id');
}

function clearConversationId(): void {
  try {
    fs.rmSync(getConversationStatePath(), { force: true });
  } catch {
    // Best-effort
  }
}

function readConversationId(): string | undefined {
  try {
    // Cap length defensively; real conversation ids are UUIDs (~36 chars)
    const content = fs.readFileSync(getConversationStatePath(), 'utf-8').trim().slice(0, 128);
    return content || undefined;
  } catch {
    return undefined;
  }
}

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

    // Bypass agy's built-in permission layer so the PreToolUse hook (hooks.json)
    // is the sole approval gate; without this agy soft-denies tools even when the hook returns allow
    const args = ['-p', prompt, '--dangerously-skip-permissions'];

    if (sessionId) {
      args.push('--conversation', sessionId);
      logger.info(`Using conversation: ${sessionId}`);
    }

    logger.info(`Executing agy: -p ${prompt.slice(0, 50)}...`);

    // Remove any stale conversation id so we only read one recorded by THIS
    // execution's hook events (the hook writes it fresh on every event)
    clearConversationId();

    return new Promise((resolve, reject) => {
      const proc = spawn('agy', args, {
        cwd: actualWorkDir,
        env: {
          ...process.env,
          AI_ON_CALL_CONVERSATION_STATE: getConversationStatePath(),
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

        const result = stdout.trim();

        // The hook bridge records conversationId during execution (PreToolUse
        // and Stop events); agy -p prints no session info itself
        const newConversationId = readConversationId();

        resolve({
          stdout: result,
          stderr,
          sessionId: newConversationId || sessionId,
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
