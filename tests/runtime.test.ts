import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getRuntime, ClaudeCodeRuntime, QwenCodeRuntime, OpenCodeRuntime, GeminiCodeRuntime, AntigravityRuntime, type ToolCall } from '../src/runtime/index.js';
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

    it('應該返回 antigravity runtime', () => {
      const runtime = getRuntime('antigravity', '/tmp');
      expect(runtime.name).toBe('antigravity');
      expect(runtime).toBeInstanceOf(AntigravityRuntime);
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

  describe('AntigravityRuntime needsApproval', () => {
    it('應該在需要審批的工具時返回 true', () => {
      const runtime = new AntigravityRuntime('/tmp');
      expect(runtime.needsApproval({ name: 'Bash', params: '{}' })).toBe(true);
      expect(runtime.needsApproval({ name: 'Write', params: '{}' })).toBe(true);
      expect(runtime.needsApproval({ name: 'Edit', params: '{}' })).toBe(true);
    });

    it('應該在不需要審批的工具時返回 false', () => {
      const runtime = new AntigravityRuntime('/tmp');
      expect(runtime.needsApproval({ name: 'Read', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'Glob', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'Grep', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'Search', params: '{}' })).toBe(false);
      expect(runtime.needsApproval({ name: 'WebFetch', params: '{}' })).toBe(false);
    });
  });

  describe('AntigravityRuntime execute', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('應該使用正確的參數呼叫 agy CLI', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.stdout.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from('response output'));
      });
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      const runtime = new AntigravityRuntime('/test/workdir');
      const result = await runtime.execute('test prompt', '/test/workdir');

      expect(result.stdout).toBe('response output');
      expect(spawn).toHaveBeenCalledWith('agy', ['-p', 'test prompt', '--dangerously-skip-permissions'], expect.objectContaining({
        cwd: '/test/workdir',
      }));
    });

    it('應該在有 conversationId 時使用 --conversation 參數', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.stdout.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from('response'));
      });
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      const runtime = new AntigravityRuntime('/test/workdir');
      await runtime.execute('test prompt', '/test/workdir', 'conv-123');

      expect(spawn).toHaveBeenCalledWith('agy', ['-p', 'test prompt', '--dangerously-skip-permissions', '--conversation', 'conv-123'], expect.anything());
    });

    it('應該在遇到 rate limit 時拋出錯誤', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.stderr.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from('rate limit exceeded'));
      });
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      const runtime = new AntigravityRuntime('/test/workdir');
      await expect(runtime.execute('test prompt', '/test/workdir')).rejects.toThrow('過於頻繁');
    });

    it('應該忽略 imagePaths 參數（不支援）', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.stdout.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from('result'));
      });
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      const runtime = new AntigravityRuntime('/test/workdir');
      await runtime.execute('test prompt', '/test/workdir', undefined, ['/tmp/img.jpg']);

      const args = (spawn as any).mock.calls[0][1] as string[];
      expect(args).not.toContain('--file');
    });
  });

  describe('AntigravityRuntime conversation resume', () => {
    const STATE_FILE = path.join(os.tmpdir(), `agy-conv-test-${process.pid}`);

    beforeEach(() => {
      vi.clearAllMocks();
      process.env.AI_ON_CALL_CONVERSATION_STATE = STATE_FILE;
    });

    afterEach(() => {
      delete process.env.AI_ON_CALL_CONVERSATION_STATE;
      fs.rmSync(STATE_FILE, { force: true });
    });

    function mockAgyRun(stdoutContent = 'response'): void {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.stdout.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'data') {
          // Simulate the hook bridge writing the conversation id mid-run
          fs.writeFileSync(STATE_FILE, 'fresh-conv-uuid');
          cb(Buffer.from(stdoutContent));
        }
      });
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') setTimeout(() => cb(0), 0);
      });
    }

    it('應該在執行前清除舊狀態檔，並在結束後讀取新的 conversationId', async () => {
      fs.writeFileSync(STATE_FILE, 'stale-conv-uuid');

      mockAgyRun();

      const runtime = new AntigravityRuntime('/test/workdir');
      const result = await runtime.execute('test prompt', '/test/workdir');

      expect(result.sessionId).toBe('fresh-conv-uuid');
    });

    it('應該透過環境變數傳遞狀態檔路徑給 agy', async () => {
      mockAgyRun();

      const runtime = new AntigravityRuntime('/test/workdir');
      await runtime.execute('test prompt', '/test/workdir');

      const opts = (spawn as any).mock.calls[0][2];
      expect(opts.env.AI_ON_CALL_CONVERSATION_STATE).toBe(STATE_FILE);
    });

    it('應該在狀態檔不存在時回傳 undefined sessionId', async () => {
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.stdout.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from('no tools used'));
      });
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') setTimeout(() => cb(0), 0);
      });

      const runtime = new AntigravityRuntime('/test/workdir');
      const result = await runtime.execute('test prompt', '/test/workdir');

      expect(result.sessionId).toBeUndefined();
    });

    it('應該優先使用 hook 記錄的 conversationId 而非傳入的 sessionId', async () => {
      mockAgyRun(); // 執行中 hook 寫入 fresh-conv-uuid

      const runtime = new AntigravityRuntime('/test/workdir');
      const result = await runtime.execute('test prompt', '/test/workdir', 'old-conv-uuid');

      expect(result.sessionId).toBe('fresh-conv-uuid');
    });
  });

  describe('ClaudeCodeRuntime execute', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('應該在無圖片時不使用 --file 參數', async () => {
      const runtime = new ClaudeCodeRuntime('/test/workdir');
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

      await runtime.execute('test prompt', '/test/workdir');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        expect.not.arrayContaining(['--file']),
        expect.any(Object)
      );
    });

    it('應該在單張圖片時使用一個 --file 參數', async () => {
      const runtime = new ClaudeCodeRuntime('/test/workdir');
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

      await runtime.execute('test prompt', '/test/workdir', undefined, ['/tmp/img1.jpg']);
      await new Promise(resolve => setTimeout(resolve, 10));

      const spawnCall = (spawn as any).mock.calls[0];
      const args = spawnCall[1];
      expect(args).toContain('--file');
      expect(args[args.indexOf('--file') + 1]).toBe('/tmp/img1.jpg');
    });

    it('應該在多張圖片時使用多個 --file 參數', async () => {
      const runtime = new ClaudeCodeRuntime('/test/workdir');
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

      await runtime.execute('test prompt', '/test/workdir', undefined, ['/tmp/img1.jpg', '/tmp/img2.jpg']);
      await new Promise(resolve => setTimeout(resolve, 10));

      const spawnCall = (spawn as any).mock.calls[0];
      const args = spawnCall[1];
      const fileFlags = args.filter((a: string) => a === '--file').length;
      expect(fileFlags).toBe(2);
      expect(args).toContain('/tmp/img1.jpg');
      expect(args).toContain('/tmp/img2.jpg');
    });
  });

  describe('QwenCodeRuntime execute', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('應該在無圖片時不使用 --file 參數', async () => {
      const runtime = new QwenCodeRuntime('/test/workdir');
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      await runtime.execute('test prompt', '/test/workdir');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(spawn).toHaveBeenCalledWith(
        'qwen',
        expect.not.arrayContaining(['--file']),
        expect.any(Object)
      );
    });

    it('應該在單張圖片時使用一個 --file 參數', async () => {
      const runtime = new QwenCodeRuntime('/test/workdir');
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      await runtime.execute('test prompt', '/test/workdir', undefined, ['/tmp/single.jpg']);
      await new Promise(resolve => setTimeout(resolve, 10));

      const spawnCall = (spawn as any).mock.calls[0];
      const args = spawnCall[1];
      expect(args.filter((a: string) => a === '--file').length).toBe(1);
      expect(args).toContain('/tmp/single.jpg');
    });

    it('應該在多張圖片時使用多個 --file 參數', async () => {
      const runtime = new QwenCodeRuntime('/test/workdir');
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      await runtime.execute('test prompt', '/test/workdir', undefined, ['/tmp/a.jpg', '/tmp/b.jpg', '/tmp/c.jpg']);
      await new Promise(resolve => setTimeout(resolve, 10));

      const spawnCall = (spawn as any).mock.calls[0];
      const args = spawnCall[1];
      expect(args.filter((a: string) => a === '--file').length).toBe(3);
    });
  });

  describe('OpenCodeRuntime execute', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('應該在無圖片時不使用 --file 參數', async () => {
      const runtime = new OpenCodeRuntime('/test/workdir', 'http://127.0.0.1:3001');
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      await runtime.execute('test prompt', '/test/workdir');
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(spawn).toHaveBeenCalledWith(
        'opencode',
        expect.not.arrayContaining(['--file']),
        expect.any(Object)
      );
    });

    it('應該在單張圖片時使用一個 --file 參數', async () => {
      const runtime = new OpenCodeRuntime('/test/workdir', 'http://127.0.0.1:3001');
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      await runtime.execute('test prompt', '/test/workdir', undefined, ['/tmp/single.jpg']);
      await new Promise(resolve => setTimeout(resolve, 10));

      const spawnCall = (spawn as any).mock.calls[0];
      const args = spawnCall[1];
      expect(args.filter((a: string) => a === '--file').length).toBe(1);
      expect(args).toContain('/tmp/single.jpg');
    });

    it('應該在多張圖片時使用多個 --file 參數', async () => {
      const runtime = new OpenCodeRuntime('/test/workdir', 'http://127.0.0.1:3001');
      const mockProc = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        pid: 12345,
      };
      (spawn as any).mockReturnValue(mockProc);
      mockProc.on.mockImplementation((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      });

      await runtime.execute('test prompt', '/test/workdir', undefined, ['/tmp/x.jpg', '/tmp/y.jpg']);
      await new Promise(resolve => setTimeout(resolve, 10));

      const spawnCall = (spawn as any).mock.calls[0];
      const args = spawnCall[1];
      expect(args.filter((a: string) => a === '--file').length).toBe(2);
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

    it('應該忽略 imagePaths 參數（不支援 --file）', async () => {
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

      await runtime.execute('test prompt', '/test/workdir', undefined, ['/tmp/img1.jpg', '/tmp/img2.jpg']);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(spawn).toHaveBeenCalledWith(
        'gemini',
        ['-p', 'test prompt', '--output-format', 'json'],
        expect.any(Object)
      );
    });
  });
});
