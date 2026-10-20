import { describe, it, expect } from 'vitest';
import { escapeHtml, escapedLength, truncateEscaped } from '../src/utils/escape.js';

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

describe('escapedLength', () => {
  it('counts plain strings as-is', () => {
    expect(escapedLength('hello')).toBe(5);
  });

  it('counts the expanded length of an ampersand', () => {
    expect(escapedLength('a & b')).toBe(1 + 1 + 5 + 1 + 1);
  });

  it('counts the expanded length of angle brackets', () => {
    expect(escapedLength('<>')).toBe(8);
  });

  it('is zero for an empty string', () => {
    expect(escapedLength('')).toBe(0);
  });
});

describe('truncateEscaped', () => {
  it('returns the input unchanged when it already fits', () => {
    expect(truncateEscaped('hello', 100)).toBe('hello');
  });

  it('keeps the escaped length within the budget', () => {
    const result = truncateEscaped('&'.repeat(100), 50);
    expect(escapedLength(result)).toBeLessThanOrEqual(50);
  });

  it('marks a truncated value', () => {
    expect(truncateEscaped('a'.repeat(100), 20).endsWith('...')).toBe(true);
  });

  it('keeps the plain-text length within the budget including the marker', () => {
    const result = truncateEscaped('a'.repeat(100), 20);
    expect(result.length).toBe(20);
    expect(result).toBe('a'.repeat(17) + '...');
  });

  it('never splits a surrogate pair', () => {
    const emoji = '\u{1F600}';
    const result = truncateEscaped(emoji.repeat(50), 20);
    expect(Array.from(result).every((c) => c === '.' || c === emoji)).toBe(true);
  });

  it('returns an empty string for a non-positive budget', () => {
    expect(truncateEscaped('hello', 0)).toBe('');
    expect(truncateEscaped('hello', -1)).toBe('');
  });
});
