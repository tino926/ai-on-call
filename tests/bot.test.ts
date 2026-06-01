import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStatus, handlePwd, handleCd, handleLs } from '../src/bot/commands.js';
import { handleMessage } from '../src/bot/handlers.js';
import { handleCallback } from '../src/bot/callbacks.js';
import { BotState } from '../src/state.js';
import { logger } from '../src/utils/logger.js';

vi.mock('../src/runtime/index.js', () => ({
  getRuntime: vi.fn().mockReturnValue({
    name: 'claude',
    execute: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '' }),
    needsApproval: vi.fn().mockReturnValue(false),
  }),
}));

// Mock Telegraf Context
const createMockContext = (chatId: number = 123456, messageText: string = '') => ({
  chatId,
  reply: vi.fn().mockResolvedValue(true),
  message: {
    text: messageText,
    chat: { id: chatId },
  },
  from: { id: chatId },
});

describe('Bot Commands', () => {
  let mockCtx: any;
  let state: BotState;

  const mockConfig = {
    bot: { token: 'test', allowedUserId: 123456 },
    runtime: { default: 'claude', workDir: '.' },
    hook: { host: '127.0.0.1', port: 9876, opencodeHttpPort: 3001, timeoutSec: 300 },
    logging: { level: 'info' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = createMockContext();
    state = new BotState(mockConfig);
  });

  describe('handleStatus', () => {
    it('應該回覆 bot 狀態', async () => {
      await handleStatus(mockCtx, state);

      expect(mockCtx.reply).toHaveBeenCalled();
      const replyArg = mockCtx.reply.mock.calls[0][0];
      expect(replyArg).toContain('📊 Bot 狀態');
    });
  });

  describe('handlePwd', () => {
    it('應該回覆目前工作目錄', async () => {
      await handlePwd(mockCtx, state);

      expect(mockCtx.reply).toHaveBeenCalled();
      const replyArg = mockCtx.reply.mock.calls[0][0];
      expect(replyArg).toContain('📁');
    });
  });

  describe('handleCd', () => {
    it('應該在目錄不存在時顯示錯誤', async () => {
      mockCtx = createMockContext(123456, '/cd /nonexistent/path');
      await handleCd(mockCtx, state, '/nonexistent/path');

      expect(mockCtx.reply).toHaveBeenCalled();
      const replyArg = mockCtx.reply.mock.calls[0][0];
      expect(replyArg).toContain('不存在');
    });

    it('應該在目錄存在時切換成功', async () => {
      mockCtx = createMockContext(123456, '/cd .');
      await handleCd(mockCtx, state, '.');

      expect(mockCtx.reply).toHaveBeenCalled();
      const replyArg = mockCtx.reply.mock.calls[0][0];
      expect(replyArg).toContain('切換');
    });
  });

  describe('handleLs', () => {
    it('應該列出目錄內容', async () => {
      mockCtx = createMockContext(123456, '/ls');
      await handleLs(mockCtx, state);

      expect(mockCtx.reply).toHaveBeenCalled();
    });
  });
});

describe('handleRuntimeCallback', () => {
  const createMockCallbackCtx = (callbackData: string, fromId: number = 123456) => ({
    answerCbQuery: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue(true),
    callbackQuery: {
      data: callbackData,
      message: { text: 'test' },
    },
    from: { id: fromId },
  });

  const mockConfig = {
    bot: { token: 'test', allowedUserId: 123456 },
    runtime: { default: 'claude', workDir: '.' },
    hook: { host: '127.0.0.1', port: 9876, opencodeHttpPort: 3001, approvalApiPort: 9877, timeoutSec: 300 },
    logging: { level: 'info' },
  };

  it('應該切換到 claude runtime', async () => {
    const state = new BotState(mockConfig);
    const ctx = createMockCallbackCtx('runtime:claude');

    await handleCallback(ctx as any, state);

    expect(state.runtimeName).toBe('claude');
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    const message = ctx.answerCbQuery.mock.calls[0][0];
    expect(message).toContain('claude');
    expect(message).not.toContain('yolo mode');
  });

  it('應該切換到 qwen runtime（含 qwen 警告）', async () => {
    const state = new BotState(mockConfig);
    const ctx = createMockCallbackCtx('runtime:qwen');

    await handleCallback(ctx as any, state);

    expect(state.runtimeName).toBe('qwen');
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    const message = ctx.answerCbQuery.mock.calls[0][0];
    expect(message).toContain('yolo mode');
  });

  it('應該切換到 opencode runtime（含 opencode 警告）', async () => {
    const state = new BotState(mockConfig);
    const ctx = createMockCallbackCtx('runtime:opencode');

    await handleCallback(ctx as any, state);

    expect(state.runtimeName).toBe('opencode');
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    const message = ctx.answerCbQuery.mock.calls[0][0];
    expect(message).toContain('實驗階段');
  });

  it('應該切換到 gemini runtime（含 gemini 警告）', async () => {
    const state = new BotState(mockConfig);
    const ctx = createMockCallbackCtx('runtime:gemini');

    await handleCallback(ctx as any, state);

    expect(state.runtimeName).toBe('gemini');
    expect(ctx.answerCbQuery).toHaveBeenCalled();
    const message = ctx.answerCbQuery.mock.calls[0][0];
    expect(message).toContain('Hook 審批');
  });

  it('應該拒絕不支援的 runtime', async () => {
    const state = new BotState(mockConfig);
    const ctx = createMockCallbackCtx('runtime:invalid');

    await handleCallback(ctx as any, state);

    expect(state.runtimeName).toBe('claude');
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(expect.stringContaining('不支持'));
  });
});

describe('Unauthorized user access control', () => {
  const createMockContext = (fromId: number, messageText: string) => ({
    reply: vi.fn().mockResolvedValue(true),
    message: { text: messageText, chat: { id: fromId } },
    from: { id: fromId },
  });

  it('應該允許 allowedUserId = 0（不限制任何人）', async () => {
    const mockConfig = {
      bot: { token: 'test', allowedUserId: 0 },
      runtime: { default: 'claude', workDir: '.' },
      hook: { host: '127.0.0.1', port: 9876, opencodeHttpPort: 3001, timeoutSec: 300 },
      logging: { level: 'info' },
    };
    const state = new BotState(mockConfig);
    const mockCtx = createMockContext(999999, 'hello');

    await handleMessage(mockCtx as any, state);

    expect(mockCtx.reply).not.toHaveBeenCalledWith(expect.stringContaining('無權使用'));
  });

  it('應該允許符合 allowedUserId 的使用者', async () => {
    const mockConfig = {
      bot: { token: 'test', allowedUserId: 123456 },
      runtime: { default: 'claude', workDir: '.' },
      hook: { host: '127.0.0.1', port: 9876, opencodeHttpPort: 3001, timeoutSec: 300 },
      logging: { level: 'info' },
    };
    const state = new BotState(mockConfig);
    const mockCtx = createMockContext(123456, 'hello');

    await handleMessage(mockCtx as any, state);

    expect(mockCtx.reply).not.toHaveBeenCalledWith(expect.stringContaining('無權使用'));
  });

  it('應該拒絕不符 allowedUserId 的使用者', async () => {
    const mockConfig = {
      bot: { token: 'test', allowedUserId: 123456 },
      runtime: { default: 'claude', workDir: '.' },
      hook: { host: '127.0.0.1', port: 9876, opencodeHttpPort: 3001, timeoutSec: 300 },
      logging: { level: 'info' },
    };
    const state = new BotState(mockConfig);
    const mockCtx = createMockContext(999999, 'hello');

    await handleMessage(mockCtx as any, state);

    expect(mockCtx.reply).toHaveBeenCalledWith('無權使用此 bot');
  });
});
