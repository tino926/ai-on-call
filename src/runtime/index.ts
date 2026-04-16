import { ClaudeCodeRuntime } from './claude.js';
import { QwenCodeRuntime } from './qwen.js';
import { OpenCodeRuntime } from './opencode.js';
import { GeminiCodeRuntime } from './gemini.js';

export interface ToolCall {
  name: string;
  params: string;
}

export interface RuntimeOutput {
  stdout: string;
  stderr: string;
  sessionId?: string;
}

export interface AiRuntime {
  name: string;
  execute(
    prompt: string,
    workDir: string,
    sessionId?: string,
    imagePath?: string
  ): Promise<RuntimeOutput>;
  needsApproval(toolCall: ToolCall): boolean;
}

/**
 * Get runtime by name
 */
export function getRuntime(name: string, workDir: string, hookUrl?: string): AiRuntime {
  switch (name.toLowerCase()) {
    case 'claude':
      return new ClaudeCodeRuntime(workDir);
    case 'qwen':
      return new QwenCodeRuntime(workDir);
    case 'opencode':
      return new OpenCodeRuntime(workDir, hookUrl || 'http://127.0.0.1:3001');
    case 'gemini':
      return new GeminiCodeRuntime(workDir);
    default:
      throw new Error(`Unsupported runtime: ${name}. Supported: claude, qwen, opencode, gemini`);
  }
}

// Re-export for convenience
export { ClaudeCodeRuntime, QwenCodeRuntime, OpenCodeRuntime, GeminiCodeRuntime };
