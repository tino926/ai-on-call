import { describe, it, expect } from 'vitest';
import { getConfigDir, ensureDirectories, CONFIG_DIR, DATA_DIR } from '../src/utils/paths.js';

describe('Paths Utils', () => {
  describe('getConfigDir', () => {
    it('應該返回當前目錄（本地開發）', () => {
      const dir = getConfigDir();
      expect(dir).toBeDefined();
    });

    it('應該使用 AI_ON_CALL_HOME 環境變數', () => {
      const original = process.env.AI_ON_CALL_HOME;
      process.env.AI_ON_CALL_HOME = '/custom/path';
      const dir = getConfigDir();
      expect(dir).toBe('/custom/path');
      process.env.AI_ON_CALL_HOME = original;
    });
  });

  describe('ensureDirectories', () => {
    it('應該創建必要的目錄', () => {
      expect(() => ensureDirectories()).not.toThrow();
      expect(CONFIG_DIR).toBeDefined();
      expect(DATA_DIR).toBeDefined();
    });
  });

  describe('constants', () => {
    it('應該导出 CONFIG_DIR', () => {
      expect(CONFIG_DIR).toBeDefined();
      expect(typeof CONFIG_DIR).toBe('string');
    });

    it('應該导出 DATA_DIR', () => {
      expect(DATA_DIR).toBeDefined();
      expect(typeof DATA_DIR).toBe('string');
    });
  });
});
