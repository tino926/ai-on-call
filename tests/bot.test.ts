import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStatus, handlePwd, handleCd, handleLs } from '../src/bot/commands.js';
import { handleMessage } from '../src/bot/handlers.js';
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
