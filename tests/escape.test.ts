import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/utils/escape.js';

const AMP = '&' + 'amp;';
const LT = '&' + 'lt;';
const GT = '&' + 'gt;';

describe('escapeHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeHtml('a & b')).toBe('a ' + AMP + ' b');
  });

  it('escapes < and > to entities', () => {
    expect(escapeHtml('<script>')).toBe(LT + 'script' + GT);
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('5 > 3')).toBe('5 ' + GT + ' 3');
  });

  it('escapes all three', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a ' + AMP + ' b ' + LT + ' c ' + GT + ' d');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles string with no special chars', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles multiple occurrences', () => {
    const input = 'a & b & c < d < e > f > g';
    const expected = 'a ' + AMP + ' b ' + AMP + ' c ' + LT + ' d ' + LT + ' e ' + GT + ' f ' + GT + ' g';
    expect(escapeHtml(input)).toBe(expected);
  });

  it('escapes only one special char', () => {
    expect(escapeHtml('<')).toBe(LT);
  });
});
