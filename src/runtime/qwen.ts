import { spawn } from 'child_process';
import { AiRuntime, RuntimeOutput, ToolCall } from './index.js';
import { logger } from '../utils/logger.js';

export class QwenCodeRuntime implements AiRuntime {
  readonly name = 'qwen';
  
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
      '--output-format',
      'json',
      // Auto-approve all operations - Qwen doesn't have hook mechanism
      // Use yolo mode to skip all approvals
      '--approval-mode',
      'yolo',
    ];
    
    if (sessionId) {
      args.push('--resume', sessionId);
    }

    if (imagePath) {
      args.push('--file', imagePath);
    }

    logger.info(`Executing Qwen with args: -p ${prompt.slice(0, 50)}...`);

    return new Promise((resolve, reject) => {
      // Use qwen directly from PATH
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

      // Timeout after 60 seconds for summary requests, 10 minutes for normal requests
      const isSummaryRequest = prompt.includes('摘要');
      const timeoutMs = isSummaryRequest ? 60000 : 600000;
      
      const timeoutId = setTimeout(() => {
        logger.warn(`Qwen execution timeout after ${timeoutMs}ms`);
        try {
          if (proc.pid) {
            process.kill(-proc.pid, 'SIGKILL');
          }
        } catch (e) {
          // Ignore errors
        }
        reject(new Error(`Qwen execution timeout (${timeoutMs/1000} seconds)`));
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
          reject(new Error('⚠️ Qwen API 請求過於頻繁，請稍後再試（建議等待 1-2 分鐘）'));
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
