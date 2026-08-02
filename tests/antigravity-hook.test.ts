import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureAntigravityHook } from '../src/antigravity-hook.js';

const ORIGINAL_HOME = process.env.HOME;

describe('ensureAntigravityHook', () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hook-test-'));
    process.env.HOME = tmpHome;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.HOME = ORIGINAL_HOME;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('應該建立 hooks.json 並寫入 ai-on-call-approval hook', () => {
    ensureAntigravityHook();

    const hooksFile = path.join(tmpHome, '.gemini', 'config', 'hooks.json');
    expect(fs.existsSync(hooksFile)).toBe(true);

    const hooks = JSON.parse(fs.readFileSync(hooksFile, 'utf-8'));
    expect(hooks['ai-on-call-approval']).toBeDefined();
    expect(hooks['ai-on-call-approval'].PreToolUse).toHaveLength(1);
    expect(hooks['ai-on-call-approval'].PreToolUse[0].matcher).toBe('*');
    expect(hooks['ai-on-call-approval'].PreToolUse[0].hooks[0].type).toBe('command');
    expect(hooks['ai-on-call-approval'].PreToolUse[0].hooks[0].timeout).toBe(300);
  });

  it('command 應包含 agy-hook.ts 的絕對路徑', () => {
    ensureAntigravityHook();

    const hooksFile = path.join(tmpHome, '.gemini', 'config', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksFile, 'utf-8'));
    const command = hooks['ai-on-call-approval'].PreToolUse[0].hooks[0].command;

    expect(command).toContain('agy-hook.ts');
    expect(path.isAbsolute(command)).toBe(true);
  });

  it('不應覆寫既有的 hooks 設定', () => {
    const hooksDir = path.join(tmpHome, '.gemini', 'config');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(hooksDir, 'hooks.json'),
      JSON.stringify({ 'existing-hook': { enabled: true } }, null, 2)
    );

    ensureAntigravityHook();

    const hooks = JSON.parse(fs.readFileSync(path.join(hooksDir, 'hooks.json'), 'utf-8'));
    expect(hooks['existing-hook']).toEqual({ enabled: true });
    expect(hooks['ai-on-call-approval']).toBeDefined();
  });
});
