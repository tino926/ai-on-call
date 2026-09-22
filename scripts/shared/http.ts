import http from 'http';

export interface HttpRequestOptions {
  hostname: string;
  port: number;
  method: string;
  path: string;
  body?: object;
}

export function httpRequest({ hostname, port, method, path, body }: HttpRequestOptions): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
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
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(buf));
          } catch {
            reject(new Error(`Invalid JSON: ${buf.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
