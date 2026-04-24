import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { ApprovalApiServer } from '../src/approval-api-server.js';
import { ApprovalStore } from '../src/approval.js';

describe('ApprovalApiServer', () => {
  let store: ApprovalStore;
  let servers: http.Server[] = [];

  beforeEach(() => {
    store = new ApprovalStore();
  });

  afterEach(() => {
    servers.forEach(s => s.close());
    servers = [];
  });

  function createServer(port: number): ApprovalApiServer {
    const server = new ApprovalApiServer('127.0.0.1', port, 5, 123456789, store);
    const httpServer = server.getServer();
    servers.push(httpServer);
    return server;
  }

  async function makeRequest(port: number, path: string, method: string, body?: object): Promise<any> {
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

  it('應該拒絕無效的 session_id', async () => {
    const server = createServer(18981);
    await new Promise<void>((resolve) => {
      server.getServer().listen(18981, '127.0.0.1', () => resolve());
    });

    const result = await makeRequest(18981, '/api/approval/request', 'POST', {
      tool: 'Bash',
      params: '{}',
    });

    expect(result.error).toContain('session_id');
  });

  it('應該正確處理 session_id 類型', async () => {
    const server = createServer(18982);
    await new Promise<void>((resolve) => {
      server.getServer().listen(18982, '127.0.0.1', () => resolve());
    });

    const result = await makeRequest(18982, '/api/approval/request', 'POST', {
      tool: 'Bash',
      params: '{}',
      session_id: 123,
    });

    expect(result.error).toContain('session_id');
  });

  it('應該返回正確的狀態格式', async () => {
    const server = createServer(18983);
    await new Promise<void>((resolve) => {
      server.getServer().listen(18983, '127.0.0.1', () => resolve());
    });

    const result = await makeRequest(18983, '/api/approval/test-id/status', 'GET');

    expect(result).toHaveProperty('approved');
  });

  it('應該處理不存在的狀態查詢', async () => {
    const server = createServer(18984);
    await new Promise<void>((resolve) => {
      server.getServer().listen(18984, '127.0.0.1', () => resolve());
    });

    const result = await makeRequest(18984, '/api/approval/nonexistent/status', 'GET');

    expect(result.approved).toBeNull();
  });
});