import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs';

describe('Runtime integration (real spawn)', () => {

  it('should execute a simple command and capture stdout', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const proc = spawn('echo', ['hello world'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.on('close', (code) => resolve({ stdout, stderr, code }));
      proc.on('error', reject);
    });
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.stderr).toBe('');
  });

  it('should capture stderr output', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const proc = spawn('bash', ['-c', 'echo stderr-output >&2'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.on('close', (code) => resolve({ stdout, stderr, code }));
      proc.on('error', reject);
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('stderr-output');
  });

  it('should report non-zero exit code', async () => {
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const proc = spawn('bash', ['-c', 'exit 42'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      proc.on('close', (code) => resolve({ stdout, stderr, code }));
      proc.on('error', reject);
    });
    expect(result.code).toBe(42);
  });

  it('should timeout long-running processes with SIGKILL', async () => {
    const timeoutMs = 500;
    const start = Date.now();

    await expect(new Promise<void>((resolve, reject) => {
      const proc = spawn('sleep', ['10'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timeoutId = setTimeout(() => {
        if (proc.pid) {
          try {
            proc.kill('SIGKILL');
          } catch {
            // Process already exited
          }
        }
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      proc.on('close', () => { clearTimeout(timeoutId); resolve(); });
      proc.on('error', (err) => { clearTimeout(timeoutId); reject(err); });
    })).rejects.toThrow('Timeout');

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(timeoutMs - 100);
  });

  it('should capture rate limit keywords via stderr', async () => {
    const rateLimitKeywords = [
      'rate limit',
      'too many requests',
      '429',
      'quota exceeded',
      'request limit',
      'throttl',
    ];
    for (const keyword of rateLimitKeywords) {
      const result = await new Promise<{ stderr: string }>((resolve, reject) => {
        const proc = spawn('bash', ['-c', `echo ${keyword} >&2`], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        proc.stderr.on('data', (data) => { stderr += data.toString(); });
        proc.on('close', () => resolve({ stderr }));
        proc.on('error', reject);
      });
      expect(result.stderr.toLowerCase()).toContain(keyword);
    }
  });

  it('should respect the cwd option', async () => {
    const tmpDir = fs.mkdtempSync('/tmp/e2e-test-');
    try {
      const result = await new Promise<{ stdout: string }>((resolve, reject) => {
        const proc = spawn('pwd', [], {
          cwd: tmpDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.on('close', () => resolve({ stdout }));
        proc.on('error', reject);
      });
      expect(result.stdout.trim()).toBe(tmpDir);
    } finally {
      fs.rmdirSync(tmpDir);
    }
  });

  it('should inherit environment variables', async () => {
    const result = await new Promise<{ stdout: string }>((resolve, reject) => {
      const proc = spawn('bash', ['-c', 'echo $PATH'], {
        env: { ...process.env, TEST_VAR: 'test-value' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.on('close', () => resolve({ stdout }));
      proc.on('error', reject);
    });
    expect(result.stdout.trim()).toBeTruthy();
    expect(result.stdout.trim()).toContain('/');
  });

  it('should handle large stdout output without truncation', async () => {
    const size = 100 * 1024;
    const result = await new Promise<{ stdout: string }>((resolve, reject) => {
      const proc = spawn('bash', ['-c', `dd if=/dev/zero bs=1024 count=100 2>/dev/null | tr '\\0' 'A'`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.on('close', () => resolve({ stdout }));
      proc.on('error', reject);
    });
    expect(result.stdout.length).toBe(size);
  });
});
