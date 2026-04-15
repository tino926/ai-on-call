import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tempDir: string;
let originalEnv: typeof process.env;

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

import { loadConfig, getCurrentConfigPath } from '../src/config.js';

beforeEach(() => {
  vi.clearAllMocks();
  originalEnv = { ...process.env };
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-on-call-test-'));
  process.env.AI_ON_CALL_CONFIG = path.join(tempDir, 'config.toml');
});

afterEach(() => {
  process.env = originalEnv;
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

afterAll(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('Config', () => {
  it('應該成功載入有效配置', () => {
    const configContent = `
[bot]
token = "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
allowed_user_id = 123456789

[runtime]
default = "claude"
work_dir = "."

[hook]
host = "127.0.0.1"
port = 9876
opencode_http_port = 3001
timeout_sec = 300

[logging]
level = "info"
`;
    fs.writeFileSync(path.join(tempDir, 'config.toml'), configContent);

    const config = loadConfig('zh-TW');

    expect(config.bot.token).toBe('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz');
    expect(config.bot.allowedUserId).toBe(123456789);
    expect(config.runtime.default).toBe('claude');
    expect(config.hook.port).toBe(9876);
    expect(config.logging.level).toBe('info');
  });

  it('should resolve workDir to absolute path', () => {
    const configContent = `
[bot]
token = "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
allowed_user_id = 0

[runtime]
default = "claude"
work_dir = "."

[hook]
host = "127.0.0.1"
port = 9876
opencode_http_port = 3001
timeout_sec = 300

[logging]
level = "info"
`;
    fs.writeFileSync(path.join(tempDir, 'config.toml'), configContent);

    const config = loadConfig('zh-TW');

    expect(config.runtime.workDir).toBe(process.cwd());
  });

  it('should return correct config path via getCurrentConfigPath', () => {
    const configContent = `
[bot]
token = "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
allowed_user_id = 0

[runtime]
default = "claude"
work_dir = "."

[hook]
host = "127.0.0.1"
port = 9876
opencode_http_port = 3001
timeout_sec = 300

[logging]
level = "info"
`;
    const configPath = path.join(tempDir, 'config.toml');
    fs.writeFileSync(configPath, configContent);

    loadConfig('zh-TW');

    expect(getCurrentConfigPath()).toBe(configPath);
  });
});
