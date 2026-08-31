import { ClaudeCodeRuntime } from './claude.js';
import { QwenCodeRuntime } from './qwen.js';
import { OpenCodeRuntime } from './opencode.js';
import { GeminiCodeRuntime } from './gemini.js';
import { AntigravityRuntime } from './antigravity.js';
import { PiRuntime } from './pi.js';

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
    imagePaths?: string[]
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
    case 'antigravity':
      return new AntigravityRuntime(workDir);
    case 'gemini':
      return new GeminiCodeRuntime(workDir);
    case 'pi':
      return new PiRuntime(workDir);
    default:
      throw new Error(`Unsupported runtime: ${name}. Supported: claude, qwen, opencode, gemini, antigravity, pi`);
  }
}

// Re-export for convenience
export { ClaudeCodeRuntime, QwenCodeRuntime, OpenCodeRuntime, GeminiCodeRuntime, AntigravityRuntime, PiRuntime };
