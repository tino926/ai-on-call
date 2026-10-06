import http from 'http';

const DEFAULT_TIMEOUT_MS = 5000;

export interface HttpRequestOptions {
  hostname: string;
  port: number;
  method: string;
  path: string;
  body?: object;
  timeoutMs?: number;
}

export function httpRequest({
  hostname,
  port,
  method,
  path,
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: HttpRequestOptions): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const data = body ? JSON.stringify(body) : undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      req.destroy();
      fn();
    };

    const req = http.request(
      {
        hostname,
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk: Buffer) => (buf += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            finish(() => reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`)));
            return;
          }
          try {
            const parsed = JSON.parse(buf);
            finish(() => resolve(parsed));
          } catch {
            finish(() => reject(new Error(`Invalid JSON: ${buf.slice(0, 200)}`)));
          }
        });
      }
    );

    req.on('error', (err) => finish(() => reject(err)));
    req.on('timeout', () => finish(() => reject(new Error(`Request timeout after ${timeoutMs}ms`))));

    if (data) req.write(data);
    req.end();
  });
}