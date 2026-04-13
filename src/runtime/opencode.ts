import { spawn } from 'child_process';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';

export class OpenCodeRuntime implements AiRuntime {
  readonly name = 'opencode';
  
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL_MS = 5000;

  constructor(
    private workDir: string,
    private hookUrl: string,
  ) {}

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
    imagePath?: string
  ): Promise<RuntimeOutput> {
    await this.waitForRateLimit();
    
    const actualWorkDir = _workDir || this.workDir;
    
    const args = [
      'run',
      '--format', 'json',
      '--print-logs',
    ];

    if (sessionId) {
      args.push('--session', sessionId);
      logger.info(`Using session: ${sessionId}`);
    }

    if (imagePath) {
      args.push('--file', imagePath);
    }

    args.push(prompt);

    logger.info(`Executing OpenCode: run ${prompt.slice(0, 50)}...`);
    logger.info(`Setting TELEGRAM_BOT_HOOK=1 and TELEGRAM_BOT_HOOK_URL for hook approval`);

    return new Promise((resolve, reject) => {
      const proc = spawn('opencode', args, {
        cwd: actualWorkDir,
        env: {
          ...process.env,
          TELEGRAM_BOT_HOOK: '1',
          TELEGRAM_BOT_HOOK_URL: this.hookUrl,
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
        logger.debug(`OpenCode stderr: ${data.toString().slice(0, 200)}`);
      });

      const timeoutMs = 600000;
      
      const timeoutId = setTimeout(() => {
        logger.warn(`OpenCode execution timeout after ${timeoutMs}ms`);
        try {
          if (proc.pid) {
            process.kill(-proc.pid, 'SIGKILL');
          }
        } catch (e) {
          // Ignore errors
        }
        reject(new Error(`OpenCode execution timeout (${timeoutMs/1000} seconds)`));
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
          reject(new Error('⚠️ OpenCode API 請求過於頻繁，請稍後再試（建議等待 1-2 分鐘）'));
          return;
        }

        let sessionId: string | undefined;
        let result = '';

        try {
          const lines = stdout.trim().split('\n');
          const textParts: string[] = [];
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('{')) continue;
            
            try {
              const json = JSON.parse(trimmed);
              
              if ((json.sessionID || json.session_id) && !sessionId) {
                sessionId = json.sessionID || json.session_id;
              }

              if (json.type === 'text' && json.part?.text) {
                textParts.push(json.part.text);
              }
              
              if (json.type === 'result' && json.result) {
                if (json.is_error) {
                  reject(new Error(json.result || 'OpenCode 執行錯誤'));
                  return;
                }
                result = json.result;
                break;
              }
              
              if (json.is_error) {
                reject(new Error(json.result || json.message || 'OpenCode 執行錯誤'));
                return;
              }
            } catch {
              continue;
            }
          }
          
          if (!result && textParts.length > 0) {
            result = textParts.join('\n');
          }
          
          if (!result) {
            result = stdout;
          }
        } catch (e) {
          logger.warn(`Failed to parse OpenCode JSON output: ${e}`);
          result = stdout;
        }

        resolve({
          stdout: result,
          stderr,
          sessionId,
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
