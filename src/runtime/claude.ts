import { spawn } from 'child_process';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';
import { createRateLimitState, waitForRateLimit, setupProcessTimeout, checkRateLimitError } from '../utils/runtime.js';

export class ClaudeCodeRuntime implements AiRuntime {
  readonly name = 'claude';

  private rateLimitState = createRateLimitState();

  constructor(private workDir: string) {}

  async execute(
    prompt: string,
    _workDir: string,
    sessionId?: string,
    imagePaths?: string[]
  ): Promise<RuntimeOutput> {
    await waitForRateLimit(this.rateLimitState);

    const actualWorkDir = _workDir || this.workDir;

    const args = [
      '-p',
      prompt,
      '--max-turns',
      '20',
      '--output-format',
      'json',
      '--dangerously-skip-permissions',
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    if (imagePaths) {
      for (const p of imagePaths) {
        args.push('--file', p);
      }
    }

    logger.info(`Executing Claude with args: -p ${prompt.slice(0, 50)}...`);
    logger.info(`Setting TELEGRAM_BOT_HOOK=1 and IS_SANDBOX=1 for hook approval`);

    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        cwd: actualWorkDir,
        env: {
          ...process.env,
          CLAUDECODE: '',
          TELEGRAM_BOT_HOOK: '1',
          IS_SANDBOX: '1',
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
        logger.debug(`Claude stderr: ${data.toString().slice(0, 200)}`);
      });

      const isSummaryRequest = prompt.includes('摘要');
      const timeoutMs = isSummaryRequest ? 60000 : 600000;

      const { clear: clearTimeout } = setupProcessTimeout(proc, timeoutMs, 'Claude', () => {
        reject(new Error(`Claude execution timeout (${timeoutMs / 1000} seconds)`));
      });

      proc.on('close', (_code) => {
        clearTimeout();

        const rateLimitError = checkRateLimitError(stderr, 'Claude');
        if (rateLimitError) {
          reject(new Error(rateLimitError));
          return;
        }
        
        // Parse session_id and result from JSON output
        let sessionId: string | undefined;
        let result: string = stdout;

        try {
          // Claude Code outputs JSON lines, parse each line to find the result
          const lines = stdout.trim().split('\n');
          
          // Try to parse each line as JSON (more robust than just last line)
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            
            // Skip empty lines and non-JSON lines
            if (!line || !line.startsWith('{')) continue;
            
            try {
              const json = JSON.parse(line);
              
              // Get session_id from any JSON object
              if (json.session_id && !sessionId) {
                sessionId = json.session_id;
              }

              // Get result from the final result object
              if (json.type === 'result') {
                if (json.result) {
                  result = json.result;
                }
                
                if (json.is_error) {
                  reject(new Error(json.result || 'Claude 執行錯誤'));
                  return;
                }
                
                if (json.permission_denials && json.permission_denials.length > 0) {
                  logger.warn(`Permission denials: ${JSON.stringify(json.permission_denials)}`);
                }
                
                // Found the result, stop parsing
                break;
              }
            } catch {
              // Skip invalid JSON lines
              continue;
            }
          }
        } catch (e) {
          logger.warn(`Failed to parse Claude JSON output: ${e}`);
        }

        resolve({
          stdout: result,
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
    // Auto-approve safe read-only tools
    const autoApproveTools = ['Read', 'Glob', 'Grep', 'Agent', 'ToolSearch'];
    return !autoApproveTools.includes(toolCall.name);
  }
}
