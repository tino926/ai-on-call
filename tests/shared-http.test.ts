import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { httpRequest } from '../scripts/shared/http.js';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

let servers: http.Server[] = [];

async function startServer(handler: Handler): Promise<number> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

function jsonHandler(statusCode: number, body: string): Handler {
  return (_req, res) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(body);
  };
}

afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
  servers = [];
});

describe('httpRequest', () => {
  it('resolves with the parsed JSON body', async () => {
    const port = await startServer(jsonHandler(200, JSON.stringify({ id: 'abc' })));

    await expect(
      httpRequest({ hostname: '127.0.0.1', port, method: 'GET', path: '/x' })
    ).resolves.toEqual({ id: 'abc' });
  });

  it('forwards the request body and method', async () => {
    let received: { method?: string; body?: string } = {};
    const port = await startServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        received = { method: req.method, body: raw };
        jsonHandler(200, '{}')(req, res);
      });
    });

    await httpRequest({ hostname: '127.0.0.1', port, method: 'POST', path: '/y', body: { a: 1 } });

    expect(received.method).toBe('POST');
    expect(JSON.parse(received.body!)).toEqual({ a: 1 });
  });

  it('rejects on a 4xx response', async () => {
    const port = await startServer(jsonHandler(404, JSON.stringify({ error: 'nope' })));

    await expect(
      httpRequest({ hostname: '127.0.0.1', port, method: 'GET', path: '/missing' })
    ).rejects.toThrow(/HTTP 404/);
  });

  it('rejects on a 5xx response', async () => {
    const port = await startServer(jsonHandler(500, 'boom'));

    await expect(
      httpRequest({ hostname: '127.0.0.1', port, method: 'GET', path: '/err' })
    ).rejects.toThrow(/HTTP 500/);
  });

  it('rejects when the response is not valid JSON', async () => {
    const port = await startServer(jsonHandler(200, 'not json'));

    await expect(
      httpRequest({ hostname: '127.0.0.1', port, method: 'GET', path: '/bad' })
    ).rejects.toThrow(/Invalid JSON/);
  });

  it('rejects when the server never responds', async () => {
    const port = await startServer(() => {
      /* never responds */
    });

    await expect(
      httpRequest({ hostname: '127.0.0.1', port, method: 'GET', path: '/hang', timeoutMs: 300 })
    ).rejects.toThrow(/timeout after 300ms/);
  });

  it('rejects on the overall deadline even when the server trickles bytes', async () => {
    // Regression: a socket-inactivity timeout never fires here because the
    // socket sees traffic every 50ms, so the promise must still settle.
    const port = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const timer = setInterval(() => res.write(' '), 50);
      res.on('close', () => clearInterval(timer));
    });

    const started = Date.now();
    await expect(
      httpRequest({ hostname: '127.0.0.1', port, method: 'GET', path: '/trickle', timeoutMs: 400 })
    ).rejects.toThrow(/timeout after 400ms/);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('rejects when the body stalls mid-transfer', async () => {
    const port = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"partial":');
      // never ends the response
    });

    await expect(
      httpRequest({ hostname: '127.0.0.1', port, method: 'GET', path: '/partial', timeoutMs: 300 })
    ).rejects.toThrow(/timeout after 300ms/);
  });

  it('rejects when the host is unreachable', async () => {
    await expect(
      httpRequest({ hostname: '127.0.0.1', port: 1, method: 'GET', path: '/x', timeoutMs: 500 })
    ).rejects.toThrow();
  });

  it('settles exactly once (no unhandled rejection) on timeout', async () => {
    const port = await startServer((_req, res) => {
      res.writeHead(200);
      const timer = setInterval(() => res.write('x'), 20);
      res.on('close', () => clearInterval(timer));
    });

    let settlements = 0;
    const promise = httpRequest({
      hostname: '127.0.0.1',
      port,
      method: 'GET',
      path: '/once',
      timeoutMs: 200,
    });
    promise.then(() => settlements++).catch(() => settlements++);

    await expect(promise).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 300));
    expect(settlements).toBe(1);
  });
});