import http from 'http';

const DEFAULT_TIMEOUT_MS = 5000;

export interface HttpRequestOptions {
  hostname: string;
  port: number;
  method: string;
  path: string;
  body?: object;
  /** Overall deadline for the whole request/response cycle, not just socket inactivity. */
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
    const data = body ? JSON.stringify(body) : undefined;
    let settled = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
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
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk: Buffer) => (buf += chunk));
        res.on('error', (err: Error) => finish(() => reject(err)));
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

    // Overall deadline: covers connect, TTFB and body transfer. Node's
    // `timeout` request option only measures socket inactivity, so a server
    // that trickles bytes can keep a promise pending forever.
    deadline = setTimeout(
      () => finish(() => reject(new Error(`Request timeout after ${timeoutMs}ms`))),
      timeoutMs
    );

    req.on('error', (err) => finish(() => reject(err)));

    if (data) req.write(data);
    req.end();
  });
}
