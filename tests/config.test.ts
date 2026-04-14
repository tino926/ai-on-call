import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

vi.mock('../src/utils/paths.js', () => ({
  getConfigDir: vi.fn().mockReturnValue(path.join(__dirname, 'fixtures')),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../src/i18n.js', () => ({
  t: vi.fn((key: string, _lang: string, params?: Record<string, string>) => {
    if (!params) return key;
    return key.replace(/\{(\w+)\}/g, (_, k) => params[k] || '');
  }),
}));

import { loadConfig } from '../src/config.js';

describe('Config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('應該成功載入有效配置', () => {
    const config = loadConfig('zh-TW');

    expect(config.bot.token).toBe('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz');
    expect(config.bot.allowedUserId).toBe(123456789);
    expect(config.runtime.default).toBe('claude');
    expect(config.hook.port).toBe(9876);
    expect(config.logging.level).toBe('info');
  });

  it('should resolve workDir to absolute path', () => {
    const config = loadConfig('zh-TW');

    expect(config.runtime.workDir).toBe(process.cwd());
  });
});
