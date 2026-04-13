import { describe, it, expect } from 'vitest';
import { getRuntime, ClaudeCodeRuntime, QwenCodeRuntime, OpenCodeRuntime } from '../src/runtime/index.js';

describe('Runtime', () => {
  describe('getRuntime', () => {
    it('應該返回 claude runtime', () => {
      const runtime = getRuntime('claude', '/tmp');
      expect(runtime.name).toBe('claude');
      expect(runtime).toBeInstanceOf(ClaudeCodeRuntime);
    });

    it('應該返回 qwen runtime', () => {
      const runtime = getRuntime('qwen', '/tmp');
      expect(runtime.name).toBe('qwen');
      expect(runtime).toBeInstanceOf(QwenCodeRuntime);
    });

    it('應該返回 opencode runtime', () => {
      const runtime = getRuntime('opencode', '/tmp', 'http://127.0.0.1:3001');
      expect(runtime.name).toBe('opencode');
      expect(runtime).toBeInstanceOf(OpenCodeRuntime);
    });

    it('應該在不支援的 runtime 時拋出錯誤', () => {
      expect(() => getRuntime('unsupported' as any, '/tmp')).toThrow();
    });
  });

  describe('ClaudeCodeRuntime needsApproval', () => {
    it('應該在需要審批的工具時返回 true', () => {
      const runtime = new ClaudeCodeRuntime('/tmp');

      // Bash, Write 需要審批
      expect(runtime.needsApproval({ name: 'Bash', params: '{}' })).toBe(true);
      expect(runtime.needsApproval({ name: 'Write', params: '{}' })).toBe(true);
    });

    it('應該在不需要審批的工具時返回 false', () => {
      const runtime = new ClaudeCodeRuntime('/tmp');

      // Read, Glob, Grep 自動批准
      expect(runtime.needsApproval({ name: 'Read', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'Glob', params: '{}' })).toBe(false);
    });
  });

  describe('QwenCodeRuntime needsApproval', () => {
    it('應該在安全工具時返回 false', () => {
      const runtime = new QwenCodeRuntime('/tmp');

      // Read, Glob, Grep 自動批准
      expect(runtime.needsApproval({ name: 'Read', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'Glob', params: '{}' })).toBe(false);
    });
  });
});
