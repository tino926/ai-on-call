import { describe, it, expect } from 'vitest';
import { t } from '../src/i18n.js';

describe('i18n', () => {
  const lang = 'zh-TW';

  it('應該查找正確的翻譯', () => {
    const result = t('errors.botRequired', lang);
    expect(result).toBeDefined();
  });

  it('應該正確替換參數', () => {
    const result = t('hooks.permission.tool', lang, { tool: 'Bash' });
    expect(result).toContain('Bash');
  });

  it('應該正規化語言代碼', () => {
    const zhCN = t('errors.botRequired', 'zh-CN');
    const zhTW = t('errors.botRequired', 'zh-TW');
    const en = t('errors.botRequired', 'en');

    expect(zhCN).toBeDefined();
    expect(zhTW).toBeDefined();
    expect(en).toBeDefined();
  });

  it('應該在找不到鍵值時使用 key 本身', () => {
    const result = t('nonexistent.key', lang);
    expect(result).toBe('nonexistent.key');
  });
});
