import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { BotState } from '../src/state.js';
import { handleMessage } from '../src/bot/handlers.js';
import { getRuntime } from '../src/runtime/index.js';
import type { AiRuntime, RuntimeOutput, ToolCall } from '../src/runtime/index.js';

vi.mock('../src/runtime/index.js', () => ({
  getRuntime: vi.fn(() => new TestRuntime()),
}));

class TestRuntime implements AiRuntime {
  name = 'test';

  async execute(prompt: string, workDir: string, _sessionId?: string, _imagePaths?: string[]): Promise<RuntimeOutput> {
    return new Promise((resolve, reject) => {
      const proc = spawn('bash', ['-c', `echo "Echo: ${prompt.replace(/"/g, '\\"')}"`], {
        cwd: workDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', () => resolve({ stdout: stdout.trim(), stderr: stderr.trim() }));
      proc.on('error', reject);
    });
  }

  needsApproval(_toolCall: ToolCall): boolean {
    return false;
  }
}

class FailingTestRuntime implements AiRuntime {
  name = 'failing';

  async execute(): Promise<RuntimeOutput> {
    throw new Error('Runtime execution failed');
  }

  needsApproval(): boolean {
    return false;
  }
}

function createMockCtx(chatId = 123456, messageText = '') {
  return {
    chat: { id: chatId },
    message: { text: messageText, chat: { id: chatId } },
    from: { id: chatId },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
    telegram: {
      sendChatAction: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true),
      editMessageText: vi.fn().mockResolvedValue(true),
    },
  };
}

describe('E2E: Bot handler pipeline (real spawn)', () => {
  let state: BotState;
  let ctx: any;

  const mockConfig = {
    bot: { token: 'test', allowedUserId: 123456 },
    runtime: { default: 'test', workDir: '/tmp' },
    hook: { host: '127.0.0.1', port: 9876, opencodeHttpPort: 3001, approvalApiPort: 9877, timeoutSec: 300 },
    logging: { level: 'info' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    state = new BotState(mockConfig as any);
    ctx = createMockCtx(123456, 'hello bot');
  });

  it('should process a message through the full pipeline', async () => {
    await handleMessage(ctx, state);

    // Wait for background execution to complete
    await vi.waitFor(() => {
      expect(ctx.reply).toHaveBeenCalledTimes(2);
    }, { timeout: 10000, interval: 50 });

    // First call: status message (zh-TW default locale)
    expect(ctx.reply.mock.calls[0][0]).toContain('New session');
    expect(ctx.reply.mock.calls[0][0]).toContain('處理中');

    // Second call: runtime output
    expect(ctx.reply.mock.calls[1][0]).toContain('Echo: hello bot');

    // Status message was deleted
    expect(ctx.telegram.deleteMessage).toHaveBeenCalledWith(123456, 1);
  });

  it('should reject unauthorized users', async () => {
    const unauthorizedCtx = createMockCtx(999999, 'secret command');
    await handleMessage(unauthorizedCtx, state);

    expect(unauthorizedCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('無權'),
    );
    expect(unauthorizedCtx.reply).toHaveBeenCalledTimes(1);
  });

  it('should indicate continuing session when sessionId is set', async () => {
    state.sessionId = 'existing-session-id';

    await handleMessage(ctx, state);

    await vi.waitFor(() => {
      expect(ctx.reply).toHaveBeenCalledTimes(2);
    }, { timeout: 10000, interval: 50 });

    expect(ctx.reply.mock.calls[0][0]).toContain('Continuing session');
  });

  it('should return early for empty message text', async () => {
    const emptyCtx = createMockCtx(123456, '');
    await handleMessage(emptyCtx, state);

    expect(emptyCtx.reply).not.toHaveBeenCalled();
  });

  it('should handle runtime execution errors', async () => {
    vi.mocked(getRuntime).mockReturnValueOnce(new FailingTestRuntime());

    await handleMessage(ctx, state);

    await vi.waitFor(() => {
      expect(ctx.telegram.editMessageText).toHaveBeenCalled();
    }, { timeout: 10000, interval: 50 });

    expect(ctx.telegram.editMessageText).toHaveBeenCalledWith(
      123456,
      1,
      undefined,
      expect.stringContaining('Runtime execution failed'),
    );
  });
});
