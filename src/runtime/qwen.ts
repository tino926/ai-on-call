import { spawn } from 'child_process';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';
import { createRateLimitState, waitForRateLimit, setupProcessTimeout, checkRateLimitError } from '../utils/runtime.js';

export class QwenCodeRuntime implements AiRuntime {
  readonly name = 'qwen';

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
      '--output-format',
      'json',
      '--approval-mode',
      'yolo',
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    if (imagePaths) {
      for (const p of imagePaths) {
        args.push('--file', p);
      }
    }

    logger.info(`Executing Qwen with args: -p ${prompt.slice(0, 50)}...`);

    return new Promise((resolve, reject) => {
      const proc = spawn('qwen', args, {
        cwd: actualWorkDir,
        env: {
          ...process.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.debug(`Qwen stderr: ${data.toString().slice(0, 200)}`);
      });

      const isSummaryRequest = prompt.includes('摘要');
      const timeoutMs = isSummaryRequest ? 60000 : 600000;

      const { clear: clearTimeout } = setupProcessTimeout(proc, timeoutMs, 'Qwen', () => {
        reject(new Error(`Qwen execution timeout (${timeoutMs / 1000} seconds)`));
      });

      proc.on('close', (_code) => {
        clearTimeout();

        const rateLimitError = checkRateLimitError(stderr, 'Qwen');
        if (rateLimitError) {
          reject(new Error(rateLimitError));
          return;
        }
        
        // Parse Qwen output - it outputs multiple JSON objects (could be one line or multiple)
        let newSessionId: string | undefined;
        let result: string = stdout;
        
        try {
          // Try to parse as JSON array first, or try each line
          let jsonObjects: any[] = [];
          
          try {
            // Try parsing as array
            const parsed = JSON.parse(stdout);
            if (Array.isArray(parsed)) {
              jsonObjects = parsed;
            } else {
              jsonObjects = [parsed];
            }
          } catch {
            // Try parsing each line as separate JSON
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
              try {
                if (line.trim()) {
                  jsonObjects.push(JSON.parse(line));
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
          
          for (const json of jsonObjects) {
            // Get session_id from any object
            if (json.session_id && !newSessionId) {
              newSessionId = json.session_id;
            }
            
            // Get result from the final result object
            if (json.type === 'result') {
              if (json.result) {
                result = json.result;
              } else if (json.response) {
                result = json.response;
              } else if (json.message) {
                if (Array.isArray(json.message.content)) {
                  result = json.message.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text)
                    .join('');
                } else if (typeof json.message.content === 'string') {
                  result = json.message.content;
                }
              }
              
              if (json.is_error) {
                reject(new Error(json.result || 'Qwen 執行錯誤'));
                return;
              }
              
              if (json.permission_denials) {
                logger.warn(`Permission denials: ${JSON.stringify(json.permission_denials)}`);
              }
            }
          }
        } catch (e) {
          logger.warn(`Failed to parse Qwen output: ${e}`);
        }

        resolve({
          stdout: result,
          stderr,
          sessionId: newSessionId,
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
