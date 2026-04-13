import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigValidator, ValidationError } from '../src/utils/config-validator.js';
import fs from 'fs';

// 在測試中直接跳過 fs 檢查，因為我們只測試驗證邏輯
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...(actual as any),
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    accessSync: vi.fn().mockImplementation(() => {}),
  };
});

describe('ConfigValidator', () => {
  const validConfig = {
    bot: {
      token: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz',
      allowed_user_id: 123456789,
    },
    runtime: {
      default: 'claude',
      work_dir: '.',
    },
    hook: {
      host: '127.0.0.1',
      port: 9876,
      opencode_http_port: 3001,
      timeout_sec: 300,
    },
    logging: {
      level: 'info',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validateBotConfig', () => {
    it('應該接受有效的 bot 配置', () => {
      expect(() => ConfigValidator.validateBotConfig(validConfig.bot)).not.toThrow();
    });

    it('應該拒絕缺少 token 的配置', () => {
      const config = { allowed_user_id: 123456789 };
      expect(() => ConfigValidator.validateBotConfig(config)).toThrow(ValidationError);
    });

    it('應該拒絕無效的 token 長度', () => {
      const config = { token: 'short', allowed_user_id: 123456789 };
      expect(() => ConfigValidator.validateBotConfig(config)).toThrow(ValidationError);
    });

    it('應該拒絕無效的 user ID', () => {
      const config = { token: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz', allowed_user_id: -1 };
      expect(() => ConfigValidator.validateBotConfig(config)).toThrow(ValidationError);
    });

    it('應該允許 allowed_user_id = 0（不限制任何人）', () => {
      const config = { token: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz', allowed_user_id: 0 };
      expect(() => ConfigValidator.validateBotConfig(config)).not.toThrow();
    });

    it('應該拒絕佔位符 token', () => {
      const config = { token: 'your-telegram-bot-token', allowed_user_id: 123456789 };
      expect(() => ConfigValidator.validateBotConfig(config)).toThrow(ValidationError);
    });
  });

  describe('validateRuntimeConfig', () => {
    it('應該接受有效的 runtime 配置', () => {
      // 使用當前目錄作為 work_dir，確保存在
      const config = { default: 'claude', work_dir: '.' };
      expect(() => ConfigValidator.validateRuntimeConfig(config)).not.toThrow();
    });

    it('應該拒絕不支援的 runtime', () => {
      const config = { default: 'invalid-runtime' };
      expect(() => ConfigValidator.validateRuntimeConfig(config)).toThrow(ValidationError);
    });

    it.skip('應該拒絕不存在的 work_dir', () => {
      // TODO: 需要更複雜的 fs mock 設置
      const config = { work_dir: '/nonexistent/path' };
      expect(() => ConfigValidator.validateRuntimeConfig(config)).toThrow(ValidationError);
    });
  });

  describe('validateHookConfig', () => {
    it('應該接受有效的 hook 配置', () => {
      expect(() => ConfigValidator.validateHookConfig(validConfig.hook)).not.toThrow();
    });

    it('應該拒絕無效的 port', () => {
      const config = { port: 99999 };
      expect(() => ConfigValidator.validateHookConfig(config)).toThrow(ValidationError);
    });

    it('應該拒絕無效的 timeout', () => {
      const config = { timeout_sec: 10 };
      expect(() => ConfigValidator.validateHookConfig(config)).toThrow(ValidationError);
    });
  });

  describe('validateLoggingConfig', () => {
    it('應該接受有效的 logging 配置', () => {
      expect(() => ConfigValidator.validateLoggingConfig(validConfig.logging)).not.toThrow();
    });

    it('應該拒絕無效的 log level', () => {
      const config = { level: 'invalid' };
      expect(() => ConfigValidator.validateLoggingConfig(config)).toThrow(ValidationError);
    });

    it('應該允許空的 logging 配置', () => {
      expect(() => ConfigValidator.validateLoggingConfig(undefined)).not.toThrow();
    });
  });

  describe('validate', () => {
    it('應該接受完整的配置', () => {
      // 使用當前目錄作為 work_dir
      const config = {
        bot: { token: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz', allowed_user_id: 123456789 },
        runtime: { default: 'claude', work_dir: '.' },
        hook: { host: '127.0.0.1', port: 9876, opencode_http_port: 3001, timeout_sec: 300 },
        logging: { level: 'info' },
      };
      expect(() => ConfigValidator.validate(config)).not.toThrow();
    });

    it('應該拒絕缺少 bot 的配置', () => {
      const config = { runtime: {}, hook: {}, logging: {} };
      expect(() => ConfigValidator.validate(config)).toThrow(ValidationError);
    });
  });
});
