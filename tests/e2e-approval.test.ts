import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { ApprovalApiServer } from '../src/approval-api-server.js';
import { ApprovalStore } from '../src/approval.js';

function createMockBot() {
  return {
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    },
  };
}

type MockBot = ReturnType<typeof createMockBot>;

describe('E2E: Approval HTTP lifecycle', () => {
  let store: ApprovalStore;
  let server: ApprovalApiServer;
  let httpServer: http.Server;
  let port: number;
  let mockBot: MockBot;

  beforeEach(async () => {
    store = new ApprovalStore();
    mockBot = createMockBot();
    server = new ApprovalApiServer('127.0.0.1', 0, 10, 123456789, store);
    httpServer = server.getServer();
    await server.start(mockBot as any);

    const addr = httpServer.address();
    if (addr && typeof addr !== 'string') {
      port = addr.port;
    } else {
      throw new Error('Failed to get server port');
    }
  });

  afterEach(() => {
    server.close();
    httpServer.close();
  });

  async function makeRequest(method: string, path: string, body?: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({});
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  it('should complete full approval lifecycle (create → pending → approve → resolved)', async () => {
    const createResult = await makeRequest('POST', '/api/approval/request', {
      tool: 'Bash',
      params: JSON.stringify({ command: 'rm -rf /' }),
      session_id: 'test-session',
    });
    expect(createResult).toHaveProperty('id');
    const requestId = createResult.id;
    expect(typeof requestId).toBe('string');

    const pendingStatus = await makeRequest('GET', `/api/approval/${requestId}/status`);
    expect(pendingStatus.approved).toBeNull();

    store.complete(requestId, true);

    const approvedStatus = await makeRequest('GET', `/api/approval/${requestId}/status`);
    expect(approvedStatus.approved).toBe(true);

    expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('🔮'),
      expect.objectContaining({
        parse_mode: 'Markdown',
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.any(Array),
        }),
      })
    );
  });

  it('should complete deny lifecycle (create → pending → deny → resolved false)', async () => {
    const createResult = await makeRequest('POST', '/api/approval/request', {
      tool: 'Write',
      params: JSON.stringify({ file_path: '/etc/passwd' }),
      session_id: 'test-session-2',
    });
    expect(createResult).toHaveProperty('id');
    const requestId = createResult.id;
    expect(typeof requestId).toBe('string');

    const pendingStatus = await makeRequest('GET', `/api/approval/${requestId}/status`);
    expect(pendingStatus.approved).toBeNull();

    store.complete(requestId, false);

    const deniedStatus = await makeRequest('GET', `/api/approval/${requestId}/status`);
    expect(deniedStatus.approved).toBe(false);
  });

  it('should auto-deny on timeout', async () => {
    const timeoutStore = new ApprovalStore();
    const timeoutMockBot = createMockBot();
    const timeoutServer = new ApprovalApiServer('127.0.0.1', 0, 1, 123456789, timeoutStore);
    const timeoutHttpServer = timeoutServer.getServer();
    await timeoutServer.start(timeoutMockBot as any);
    const addr = timeoutHttpServer.address();
    const timeoutPort = addr && typeof addr !== 'string' ? addr.port : -1;

    try {
      const createResult = await new Promise<any>((resolve, reject) => {
        const options = {
          hostname: '127.0.0.1',
          port: timeoutPort,
          path: '/api/approval/request',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        };
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { resolve({}); }
          });
        });
        req.on('error', reject);
        req.write(JSON.stringify({ tool: 'Bash', params: '{}', session_id: 'timeout-test' }));
        req.end();
      });
      expect(createResult).toHaveProperty('id');
      const requestId = createResult.id;

      const pendingStatus = await new Promise<any>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${timeoutPort}/api/approval/${requestId}/status`, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { resolve({}); }
          });
        });
        req.on('error', reject);
      });
      expect(pendingStatus.approved).toBeNull();

      await new Promise((r) => setTimeout(r, 1200));

      const timedOutStatus = await new Promise<any>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${timeoutPort}/api/approval/${requestId}/status`, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { resolve({}); }
          });
        });
        req.on('error', reject);
      });
      expect(timedOutStatus.approved).toBe(false);
    } finally {
      timeoutServer.close();
      timeoutHttpServer.close();
    }
  });

  it('should include tool-specific details in the notification message', async () => {
    await makeRequest('POST', '/api/approval/request', {
      tool: 'Bash',
      params: JSON.stringify({ command: 'ls -la' }),
      session_id: 'tool-bash',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('ls -la'),
      expect.any(Object),
    );

    await makeRequest('POST', '/api/approval/request', {
      tool: 'Write',
      params: JSON.stringify({ file_path: '/tmp/test.txt' }),
      session_id: 'tool-write',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('/tmp/test.txt'),
      expect.any(Object),
    );

    await makeRequest('POST', '/api/approval/request', {
      tool: 'Read',
      params: JSON.stringify({ file_path: '/var/log/syslog' }),
      session_id: 'tool-read',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('/var/log/syslog'),
      expect.any(Object),
    );

    await makeRequest('POST', '/api/approval/request', {
      tool: 'Glob',
      params: JSON.stringify({ pattern: '**/*.ts' }),
      session_id: 'tool-glob',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('**/*.ts'),
      expect.any(Object),
    );

    await makeRequest('POST', '/api/approval/request', {
      tool: 'Grep',
      params: JSON.stringify({ pattern: 'function', path: 'src/' }),
      session_id: 'tool-grep',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('function'),
      expect.any(Object),
    );

    expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(5);
  });

  it('should include tool-specific details for agy PascalCase params', async () => {
    await makeRequest('POST', '/api/approval/request', {
      tool: 'Bash',
      params: JSON.stringify({ CommandLine: 'npm run build', Cwd: '/workspace/project' }),
      session_id: 'agy-bash',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('npm run build'),
      expect.any(Object),
    );

    await makeRequest('POST', '/api/approval/request', {
      tool: 'Write',
      params: JSON.stringify({ TargetFile: '/tmp/agy-write.txt' }),
      session_id: 'agy-write',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('/tmp/agy-write.txt'),
      expect.any(Object),
    );

    await makeRequest('POST', '/api/approval/request', {
      tool: 'Read',
      params: JSON.stringify({ AbsolutePath: '/var/log/syslog' }),
      session_id: 'agy-read',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('/var/log/syslog'),
      expect.any(Object),
    );

    await makeRequest('POST', '/api/approval/request', {
      tool: 'Glob',
      params: JSON.stringify({ DirectoryPath: '/workspace' }),
      session_id: 'agy-glob',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('/workspace'),
      expect.any(Object),
    );

    await makeRequest('POST', '/api/approval/request', {
      tool: 'Grep',
      params: JSON.stringify({ SearchPath: 'src/', Query: 'function' }),
      session_id: 'agy-grep',
    });
    expect(mockBot.telegram.sendMessage).toHaveBeenLastCalledWith(
      expect.any(Number),
      expect.stringContaining('function'),
      expect.any(Object),
    );
  });

  it('should handle concurrent requests independently', async () => {
    const [res1, res2] = await Promise.all([
      makeRequest('POST', '/api/approval/request', { tool: 'Bash', params: '{}', session_id: 'con-1' }),
      makeRequest('POST', '/api/approval/request', { tool: 'Bash', params: '{}', session_id: 'con-2' }),
    ]);
    const id1 = res1.id;
    const id2 = res2.id;

    const [s1, s2] = await Promise.all([
      makeRequest('GET', `/api/approval/${id1}/status`),
      makeRequest('GET', `/api/approval/${id2}/status`),
    ]);
    expect(s1.approved).toBeNull();
    expect(s2.approved).toBeNull();

    store.complete(id1, true);
    store.complete(id2, false);

    const [f1, f2] = await Promise.all([
      makeRequest('GET', `/api/approval/${id1}/status`),
      makeRequest('GET', `/api/approval/${id2}/status`),
    ]);
    expect(f1.approved).toBe(true);
    expect(f2.approved).toBe(false);
  });
});
