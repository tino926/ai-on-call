import { describe, it, expect } from 'vitest';
import { parseToolDetail } from '../src/utils/tool-detail.js';

describe('parseToolDetail', () => {
  const lang = 'en';

  it('returns null for invalid JSON', () => {
    expect(parseToolDetail('Bash', 'not json', lang)).toBeNull();
  });

  it('returns null for unknown tool', () => {
    expect(parseToolDetail('UnknownTool', JSON.stringify({ foo: 'bar' }), lang)).toBeNull();
  });

  describe('Bash', () => {
    it('parses snake_case command', () => {
      const params = JSON.stringify({ command: 'ls -la' });
      const result = parseToolDetail('Bash', params, lang);
      expect(result).toContain('ls -la');
      expect(result).toContain('<code>');
    });

    it('parses PascalCase CommandLine', () => {
      const params = JSON.stringify({ CommandLine: 'npm run build' });
      const result = parseToolDetail('Bash', params, lang);
      expect(result).toContain('npm run build');
      expect(result).toContain('<code>');
    });

    it('truncates long commands', () => {
      const longCmd = 'a'.repeat(350);
      const params = JSON.stringify({ command: longCmd });
      const result = parseToolDetail('Bash', params, lang);
      expect(result).toContain('...');
      expect(result!.length).toBeLessThan(400);
    });
  });

  describe('Write/Edit', () => {
    it('parses snake_case file_path', () => {
      const params = JSON.stringify({ file_path: '/tmp/test.txt' });
      const result = parseToolDetail('Write', params, lang);
      expect(result).toContain('/tmp/test.txt');
      expect(result).toContain('<code>');
    });

    it('parses PascalCase TargetFile', () => {
      const params = JSON.stringify({ TargetFile: '/tmp/test.txt' });
      const result = parseToolDetail('Edit', params, lang);
      expect(result).toContain('/tmp/test.txt');
    });
  });

  describe('Read', () => {
    it('parses snake_case file_path', () => {
      const params = JSON.stringify({ file_path: '/var/log/syslog' });
      const result = parseToolDetail('Read', params, lang);
      expect(result).toContain('/var/log/syslog');
    });

    it('parses PascalCase AbsolutePath', () => {
      const params = JSON.stringify({ AbsolutePath: '/var/log/syslog' });
      const result = parseToolDetail('Read', params, lang);
      expect(result).toContain('/var/log/syslog');
    });
  });

  describe('Glob', () => {
    it('parses snake_case pattern', () => {
      const params = JSON.stringify({ pattern: '**/*.ts' });
      const result = parseToolDetail('Glob', params, lang);
      expect(result).toContain('**/*.ts');
    });

    it('parses PascalCase DirectoryPath', () => {
      const params = JSON.stringify({ DirectoryPath: '/workspace' });
      const result = parseToolDetail('Glob', params, lang);
      expect(result).toContain('/workspace');
    });
  });

  describe('Grep', () => {
    it('parses snake_case pattern and path', () => {
      const params = JSON.stringify({ pattern: 'function', path: 'src/' });
      const result = parseToolDetail('Grep', params, lang);
      expect(result).toContain('function');
      expect(result).toContain('src/');
    });

    it('parses PascalCase Query and SearchPath', () => {
      const params = JSON.stringify({ Query: 'function', SearchPath: 'src/' });
      const result = parseToolDetail('Grep', params, lang);
      expect(result).toContain('function');
      expect(result).toContain('src/');
    });

    it('defaults path to . when not provided', () => {
      const params = JSON.stringify({ pattern: 'test' });
      const result = parseToolDetail('Grep', params, lang);
      expect(result).toContain('.');
    });
  });

  describe('NotebookEdit', () => {
    it('parses notebook_path', () => {
      const params = JSON.stringify({ notebook_path: '/tmp/notebook.ipynb' });
      const result = parseToolDetail('NotebookEdit', params, lang);
      expect(result).toContain('/tmp/notebook.ipynb');
    });
  });

  describe('different languages', () => {
    it('works with zh-TW', () => {
      const params = JSON.stringify({ command: 'ls' });
      const result = parseToolDetail('Bash', params, 'zh-TW');
      expect(result).toContain('ls');
    });

    it('works with zh-CN', () => {
      const params = JSON.stringify({ command: 'ls' });
      const result = parseToolDetail('Bash', params, 'zh-CN');
      expect(result).toContain('ls');
    });

    it('works with ja', () => {
      const params = JSON.stringify({ command: 'ls' });
      const result = parseToolDetail('Bash', params, 'ja');
      expect(result).toContain('ls');
    });

    it('works with ko', () => {
      const params = JSON.stringify({ command: 'ls' });
      const result = parseToolDetail('Bash', params, 'ko');
      expect(result).toContain('ls');
    });
  });
});