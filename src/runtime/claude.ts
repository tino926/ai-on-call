import { spawn } from 'child_process';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';

export class ClaudeCodeRuntime implements AiRuntime {
  readonly name = 'claude';
  
  // Rate limiting per instance
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL_MS = 5000; // 5 seconds between requests

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
    imagePath?: string
  ): Promise<RuntimeOutput> {
    // Wait for rate limit
    await this.waitForRateLimit();
    
    // Use instance workDir if no workDir provided
    const actualWorkDir = _workDir || this.workDir;
    
    const args = [
      '-p',
      prompt,
      '--max-turns',
      '20',
      '--output-format',
      'json',
      // Always use --dangerously-skip-permissions with IS_SANDBOX=1
      // This is required for hook approval to work
      '--dangerously-skip-permissions',
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    if (imagePath) {
      args.push('--file', imagePath);
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
          // Always set IS_SANDBOX=1 to allow --dangerously-skip-permissions in containers
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

      // Timeout after 60 seconds for summary requests, 10 minutes for normal requests
      const isSummaryRequest = prompt.includes('摘要');
      const timeoutMs = isSummaryRequest ? 60000 : 600000;
      
      const timeoutId = setTimeout(() => {
        logger.warn(`Claude execution timeout after ${timeoutMs}ms`);
        try {
          if (proc.pid) {
            process.kill(-proc.pid, 'SIGKILL');
          }
        } catch (e) {
          // Ignore errors
        }
        reject(new Error(`Claude execution timeout (${timeoutMs/1000} seconds)`));
      }, timeoutMs);

      proc.on('close', (_code) => {
        clearTimeout(timeoutId);
        
        // Check for rate limit errors in stderr
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
          reject(new Error('⚠️ Claude API 請求過於頻繁，請稍後再試（建議等待 1-2 分鐘）'));
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
        clearTimeout(timeoutId);
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
