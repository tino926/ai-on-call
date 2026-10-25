import { describe, it, expect } from 'vitest';
import { escapeHtml, escapedLength } from '../src/utils/escape.js';
import { splitMessage } from '../src/utils/message-splitter.js';

const PRE_OPEN = '<pre>';
const PRE_CLOSE = '</pre>';
const TELEGRAM_MAX_LENGTH = 4096;

/** Payload (escaped body) of a chunk, asserting the <pre> wrapper. */
function payloadOf(chunk: string): string {
  expect(chunk.startsWith(PRE_OPEN)).toBe(true);
  expect(chunk.endsWith(PRE_CLOSE)).toBe(true);
  return chunk.slice(PRE_OPEN.length, chunk.length - PRE_CLOSE.length);
}

function stripMarker(payload: string): string {
  return payload.replace(/\n\n\(\d+\/\d+\)$/, '');
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const current = s.charCodeAt(i);
    if (current >= 0xd800 && current <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (current >= 0xdc00 && current <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe('splitMessage', () => {
  it('should return a single escaped <pre> chunk for short text', () => {
    expect(splitMessage('hello world')).toEqual(['<pre>hello world</pre>']);
  });

  it('should return single chunk for empty string', () => {
    expect(splitMessage('')).toEqual(['']);
  });

  it('should escape HTML metacharacters', () => {
    expect(splitMessage('a < b & c > d')).toEqual(['<pre>a &lt; b &amp; c &gt; d</pre>']);
  });

  it('should return single chunk for text at old 4000-char limit', () => {
    const result = splitMessage('a'.repeat(4000));
    expect(result.length).toBe(1);
  });

  it('should keep a message whose escaped form just fits in one chunk', () => {
    // 4085 escaped chars is the single-chunk ceiling (4096 minus <pre></pre>).
    const result = splitMessage('a'.repeat(4085));
    expect(result.length).toBe(1);
    expect(result[0].length).toBe(TELEGRAM_MAX_LENGTH);
  });

  it('should split when the escaped form exceeds the limit', () => {
    const result = splitMessage('a'.repeat(4086));
    expect(result.length).toBe(2);
  });

  it('should split at newline boundary', () => {
    const long = 'a'.repeat(3800) + '\n' + 'b'.repeat(5000);
    const result = splitMessage(long);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(stripMarker(payloadOf(result[0]))).toBe('a'.repeat(3800) + '\n');
  });

  it('should ignore a break point that would leave a near-empty chunk', () => {
    const long = 'short\n' + 'a'.repeat(5000);
    const result = splitMessage(long);
    expect(result.length).toBe(2);
    expect(payloadOf(result[0])).not.toMatch(/^short\n\n\n/);
  });

  it('should split at space boundary when no newline', () => {
    const long = 'a'.repeat(3800) + ' ' + 'b'.repeat(5000);
    const result = splitMessage(long);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(stripMarker(payloadOf(result[0]))).toBe('a'.repeat(3800) + ' ');
  });

  it('should hard-split long string with no break points', () => {
    const result = splitMessage('a'.repeat(5000));
    expect(result.length).toBe(2);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
    }
  });

  it('should add page markers for multi-chunk messages', () => {
    const result = splitMessage('a'.repeat(5000));
    expect(result[0]).toMatch(/\(1\/2\)/);
    expect(result[1]).toMatch(/\(2\/2\)/);
  });

  it('should not add page marker for single chunk', () => {
    const result = splitMessage('hello');
    expect(result[0]).not.toMatch(/\(\d+\/\d+\)/);
  });

  it('should handle CJK characters', () => {
    const result = splitMessage('你好世界'.repeat(1200));
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const chunk of result) {
      expect(chunk).not.toMatch(/\uFFFD/);
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
    }
  });

  it('should never split a surrogate pair', () => {
    const result = splitMessage('😀🎉🚀💯🌟'.repeat(800));
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const chunk of result) {
      expect(hasLoneSurrogate(payloadOf(chunk))).toBe(false);
    }
  });

  it('should bound chunks by escaped length when metacharacters expand', () => {
    const result = splitMessage('<'.repeat(2000));
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
      expect(payloadOf(chunk)).not.toMatch(/</);
    }
  });

  it('should lose no content while splitting', () => {
    const text = ('line <tag> & more\n' + 'x'.repeat(120) + '\n').repeat(80);
    const result = splitMessage(text);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const rejoined = result.map((chunk) => stripMarker(payloadOf(chunk))).join('');
    expect(rejoined).toBe(escapeHtml(text));
    expect(rejoined.length).toBe(escapedLength(text));
  });
});
