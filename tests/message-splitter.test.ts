import { describe, it, expect } from 'vitest';
import { splitMessage } from '../src/utils/message-splitter.js';

describe('splitMessage', () => {
  it('should return single chunk for short text', () => {
    const result = splitMessage('hello world');
    expect(result).toEqual(['hello world']);
  });

  it('should split at newline boundary', () => {
    const long = 'short\n' + 'a'.repeat(4000) + '\nend';
    const result = splitMessage(long);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toMatch(/short/);
  });

  it('should split at space boundary when no newline', () => {
    const long = 'short ' + 'a'.repeat(4000) + ' end';
    const result = splitMessage(long);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toMatch(/short/);
  });

  it('should add page markers for multi-chunk messages', () => {
    const long = 'a'.repeat(5000);
    const result = splitMessage(long);
    expect(result.length).toBe(2);
    expect(result[0]).toMatch(/\(1\/2\)/);
    expect(result[1]).toMatch(/\(2\/2\)/);
  });

  it('should not add page marker for single chunk', () => {
    const result = splitMessage('hello');
    expect(result[0]).not.toMatch(/\(\d+\/\d+\)/);
  });
});
