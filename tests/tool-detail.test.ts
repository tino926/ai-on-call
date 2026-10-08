import { describe, it, expect } from 'vitest';
import { parseToolDetail, renderToolDetail, code } from '../src/utils/tool-detail.js';

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
      const result = parseToolDetail('Bash', JSON.stringify({ command: 'ls -la' }), lang);
      expect(result).not.toBeNull();
      expect(result!.values).toEqual(['ls -la']);
    });

    it('parses PascalCase CommandLine', () => {
      const result = parseToolDetail('Bash', JSON.stringify({ CommandLine: 'npm run build' }), lang);
      expect(result!.values).toEqual(['npm run build']);
    });

    it('truncates long commands', () => {
      const result = parseToolDetail('Bash', JSON.stringify({ command: 'a'.repeat(350) }), lang);
      expect(result!.values[0].endsWith('...')).toBe(true);
      expect(result!.values[0].length).toBe(303);
    });

    it('does not truncate short commands', () => {
      const result = parseToolDetail('Bash', JSON.stringify({ command: 'ls' }), lang);
      expect(result!.values).toEqual(['ls']);
    });
  });

  describe('Write/Edit', () => {
    it('parses snake_case file_path', () => {
      const result = parseToolDetail('Write', JSON.stringify({ file_path: '/tmp/test.txt' }), lang);
      expect(result!.values).toEqual(['/tmp/test.txt']);
    });

    it('parses PascalCase TargetFile', () => {
      const result = parseToolDetail('Edit', JSON.stringify({ TargetFile: '/tmp/test.txt' }), lang);
      expect(result!.values).toEqual(['/tmp/test.txt']);
    });
  });

  describe('Read', () => {
    it('parses snake_case file_path', () => {
      const result = parseToolDetail('Read', JSON.stringify({ file_path: '/var/log/syslog' }), lang);
      expect(result!.values).toEqual(['/var/log/syslog']);
    });

    it('parses PascalCase AbsolutePath', () => {
      const result = parseToolDetail('Read', JSON.stringify({ AbsolutePath: '/var/log/syslog' }), lang);
      expect(result!.values).toEqual(['/var/log/syslog']);
    });
  });

  describe('Glob', () => {
    it('parses snake_case pattern', () => {
      const result = parseToolDetail('Glob', JSON.stringify({ pattern: '**/*.ts' }), lang);
      expect(result!.values).toEqual(['**/*.ts']);
    });

    it('parses PascalCase DirectoryPath', () => {
      const result = parseToolDetail('Glob', JSON.stringify({ DirectoryPath: '/workspace' }), lang);
      expect(result!.values).toEqual(['/workspace']);
    });
  });

  describe('Grep', () => {
    it('parses snake_case pattern and path', () => {
      const result = parseToolDetail('Grep', JSON.stringify({ pattern: 'function', path: 'src/' }), lang);
      expect(result!.values).toEqual(['function', 'src/']);
    });

    it('parses PascalCase Query and SearchPath', () => {
      const result = parseToolDetail('Grep', JSON.stringify({ Query: 'function', SearchPath: 'src/' }), lang);
      expect(result!.values).toEqual(['function', 'src/']);
    });

    it('defaults path to . when not provided', () => {
      const result = parseToolDetail('Grep', JSON.stringify({ pattern: 'test' }), lang);
      expect(result!.values).toEqual(['test', '.']);
    });
  });

  describe('NotebookEdit', () => {
    it('parses notebook_path', () => {
      const result = parseToolDetail('NotebookEdit', JSON.stringify({ notebook_path: '/tmp/nb.ipynb' }), lang);
      expect(result!.values).toEqual(['/tmp/nb.ipynb']);
    });
  });

  describe('localization', () => {
    it('returns a non-empty label for each supported language', () => {
      const params = JSON.stringify({ command: 'ls' });
      for (const l of ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const) {
        expect(parseToolDetail('Bash', params, l)!.label.length).toBeGreaterThan(0);
      }
    });

    it('keeps the raw value identical across languages', () => {
      const params = JSON.stringify({ command: 'ls -la' });
      for (const l of ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const) {
        expect(parseToolDetail('Bash', params, l)!.values).toEqual(['ls -la']);
      }
    });

    it('distinguishes CJK from Latin-script labels', () => {
      const params = JSON.stringify({ command: 'ls' });
      const cjk = parseToolDetail('Bash', params, 'zh-TW')!.label;
      const latin = parseToolDetail('Bash', params, 'en')!.label;
      expect(cjk).not.toBe(latin);
    });
  });

  describe('returns raw values (no HTML)', () => {
    it('does not escape values', () => {
      const result = parseToolDetail('Bash', JSON.stringify({ command: '<script>' }), lang);
      expect(result!.values).toEqual(['<script>']);
    });
  });
});

describe('code', () => {
  it('wraps value in a code span', () => {
    expect(code('ls -la')).toBe(`<code>ls -la</code>`);
  });

  it('escapes HTML special characters', () => {
    const amp = '&' + 'amp;';
    const lt = '&' + 'lt;';
    const gt = '&' + 'gt;';
    expect(code('<b>&</b>')).toBe(`<code>${lt}b&gt;${amp}${lt}/b&gt;</code>`);
  });
});

describe('renderToolDetail', () => {
  it('renders label followed by code spans', () => {
    const detail = { label: 'Bash:', values: ['ls -la', '/tmp'] };
    expect(renderToolDetail(detail)).toBe('Bash: <code>ls -la</code> <code>/tmp</code>');
  });

  it('escapes values', () => {
    const lt = '&' + 'lt;';
    const detail = { label: 'Read:', values: ['<b>'] };
    expect(renderToolDetail(detail)).toBe(`Read: <code>${lt}b&gt;</code>`);
  });
});