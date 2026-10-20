import { describe, it, expect } from 'vitest';
import { buildApprovalMessage } from '../src/utils/approval-message.js';

const TELEGRAM_MAX_LENGTH = 4096;

describe('buildApprovalMessage', () => {
  it('renders the detail and the full params for a known tool', () => {
    const msg = buildApprovalMessage({
      tool: 'Grep',
      params: JSON.stringify({ pattern: 'foo', path: 'src/' }),
      lang: 'en',
    });

    expect(msg).toContain('<code>foo</code>');
    expect(msg).toContain('<code>src/</code>');
    expect(msg).toContain('Full Params:');
  });

  it('renders the params block for an unknown tool', () => {
    const msg = buildApprovalMessage({
      tool: 'UnknownTool',
      params: JSON.stringify({ note: 'hello' }),
      lang: 'en',
    });

    expect(msg).toContain('Params:');
    expect(msg).toContain('<code>');
  });

  it('prefixes the title when a prefix is given', () => {
    const withPrefix = buildApprovalMessage({ tool: 'Bash', params: '{}', lang: 'en', titlePrefix: 'OpenCode' });
    const withoutPrefix = buildApprovalMessage({ tool: 'Bash', params: '{}', lang: 'en' });

    expect(withPrefix.startsWith('OpenCode ')).toBe(true);
    expect(withoutPrefix.startsWith('OpenCode ')).toBe(false);
  });

  it('escapes the tool name', () => {
    const lt = '&' + 'lt;';
    const gt = '&' + 'gt;';
    const msg = buildApprovalMessage({ tool: '<img src=x>', params: '{}', lang: 'en' });

    expect(msg).not.toContain('<img');
    expect(msg).toContain(`Tool: ${lt}img src=x${gt}`);
  });

  it('stays within the Telegram limit for entity-heavy tool values', () => {
    const msg = buildApprovalMessage({
      tool: 'Grep',
      params: JSON.stringify({ pattern: '&'.repeat(2000), path: '&'.repeat(2000) }),
      lang: 'en',
    });

    expect(msg.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
  });

  it('stays within the Telegram limit for a huge tool name', () => {
    const msg = buildApprovalMessage({ tool: '&'.repeat(20000), params: '{}', lang: 'en' });

    expect(msg.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
  });

  it('stays within the Telegram limit for huge params', () => {
    const msg = buildApprovalMessage({
      tool: 'Bash',
      params: JSON.stringify({ command: 'x', pad: '&'.repeat(100000) }),
      lang: 'en',
    });

    expect(msg.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
  });

  it('stays within the Telegram limit for a long untitled path', () => {
    const msg = buildApprovalMessage({
      tool: 'Write',
      params: JSON.stringify({ file_path: 'a'.repeat(20000) }),
      lang: 'en',
    });

    expect(msg.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
  });

  it('keeps the plain params preview at the same 500 characters as before', () => {
    const msg = buildApprovalMessage({ tool: 'UnknownTool', params: 'x'.repeat(900), lang: 'en' });

    expect(msg).toContain('x'.repeat(500) + '...');
    expect(msg).not.toContain('x'.repeat(501));
  });
});
