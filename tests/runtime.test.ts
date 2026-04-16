import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRuntime, ClaudeCodeRuntime, QwenCodeRuntime, OpenCodeRuntime, GeminiCodeRuntime, type ToolCall } from '../src/runtime/index.js';
import { spawn } from 'child_process';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

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

    it('應該返回 gemini runtime', () => {
      const runtime = getRuntime('gemini', '/tmp');
      expect(runtime.name).toBe('gemini');
      expect(runtime).toBeInstanceOf(GeminiCodeRuntime);
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

  describe('GeminiCodeRuntime needsApproval', () => {
    it('應該在需要審批的工具時返回 true', () => {
      const runtime = new GeminiCodeRuntime('/tmp');

      // Bash, Write 需要審批
      expect(runtime.needsApproval({ name: 'Bash', params: '{}' })).toBe(true);
      expect(runtime.needsApproval({ name: 'Write', params: '{}' })).toBe(true);
      expect(runtime.needsApproval({ name: 'Edit', params: '{}' })).toBe(true);
      expect(runtime.needsApproval({ name: 'MultiEdit', params: '{}' })).toBe(true);
    });

    it('應該在不需要審批的工具時返回 false', () => {
      const runtime = new GeminiCodeRuntime('/tmp');

      // Read, Glob, Grep, Search, WebFetch 自動批准
      expect(runtime.needsApproval({ name: 'Read', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'Glob', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'Grep', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'Search', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'WebFetch', params: '{}' })).toBe(false);
    });
  });

  describe('GeminiCodeRuntime execute', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('應該使用正確的參數呼叫 gemini CLI', async () => {
      const runtime = new GeminiCodeRuntime('/test/workdir');
      const mockProc = {
        stdout: { on: vi.fn((event, cb) => { if (event === 'data') cb(Buffer.from('{}')); }) },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      const executePromise = runtime.execute('test prompt', '/test/workdir');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      mockProc.on.mock.calls.find(c => c[0] === 'close')?.[1](0);

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        ['-p', 'test prompt', '--output-format', 'json'],
        expect.objectContaining({
          cwd: '/test/workdir',
          env: expect.objectContaining({
            TELEGRAM_BOT_HOOK: '1',
          }),
        })
      );
    });

    it('應該在有 sessionId 時使用 -r 參數', async () => {
      const runtime = new GeminiCodeRuntime('/test/workdir');
      const mockProc = {
        stdout: { on: vi.fn((event, cb) => { if (event === 'data') cb(Buffer.from('{}')); }) },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      await runtime.execute('test prompt', '/test/workdir', 'session-123');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        ['-p', 'test prompt', '--output-format', 'json', '-r', 'session-123'],
        expect.any(Object)
      );
    });

    it('應該正確解析 JSON 輸出', async () => {
      const runtime = new GeminiCodeRuntime('/test/workdir');
      const mockProc = {
        stdout: { on: vi.fn((event, cb) => { if (event === 'data') cb(Buffer.from('{"response":"hello","session_id":"abc"}')); }) },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 0);
        }),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);

      const result = await runtime.execute('test', '/tmp');
      expect(result.stdout).toBe('hello');
      expect(result.sessionId).toBe('abc');
    });

    it('應該在遇到 rate limit 時拋出錯誤', async () => {
      const runtime = new GeminiCodeRuntime('/test/workdir');
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn((event, cb) => { if (event === 'data') cb(Buffer.from('rate limit exceeded')); }) },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 0);
        }),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);

      await expect(runtime.execute('test', '/tmp')).rejects.toThrow('請求過於頻繁');
    });
  });
});
