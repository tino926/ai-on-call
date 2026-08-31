import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { isToolCallEventType } from '@earendil-works/pi-coding-agent';
import http from 'http';

// ─── Config ───────────────────────────────────────────────────────────────────
const APPROVAL_HOST = process.env.HOOK_SERVER_HOST || '127.0.0.1';
const APPROVAL_PORT = parseInt(process.env.HOOK_SERVER_PORT || '9877', 10);
const APPROVAL_TIMEOUT_MS = parseInt(process.env.APPROVAL_TIMEOUT_MS || '300000', 10);
const POLL_INTERVAL_MS = 1000;

// Tools that never need approval (read-only)
const AUTO_APPROVE_TOOLS = new Set(['read', 'grep', 'find', 'ls']);

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpRequest(method: string, urlPath: string, body?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: APPROVAL_HOST,
        port: APPROVAL_PORT,
        path: urlPath,
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
          try {
            resolve(JSON.parse(buf));
          } catch {
            reject(new Error(`Invalid JSON from approval API: ${buf.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Approval flow ────────────────────────────────────────────────────────────

async function requestApproval(
  toolName: string,
  toolArgs: unknown,
  sessionId: string
): Promise<boolean> {
  const params = JSON.stringify(toolArgs);

  // 1. Submit approval request
  const { id } = await httpRequest('POST', '/api/approval/request', {
    tool: toolName,
    params,
    session_id: sessionId,
  });

  // 2. Poll until decided or timeout
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status: { approved: boolean | null } = await httpRequest(
      'GET',
      `/api/approval/${id}/status`
    );
    if (status.approved !== null) return status.approved;
    await sleep(POLL_INTERVAL_MS);
  }

  return false; // timeout → deny
}

// ─── Extension entry point ────────────────────────────────────────────────────

export default function piApprovalExtension(pi: ExtensionAPI) {
  // @ts-expect-error Pi's tool_call handler returns void | { block, reason }
  pi.on('tool_call', async (event, ctx) => {
    if (AUTO_APPROVE_TOOLS.has(event.toolName)) {
      return; // read-only tools: auto-approve
    }

    let needsApproval = false;
    if (
      isToolCallEventType('bash', event) ||
      isToolCallEventType('write', event) ||
      isToolCallEventType('edit', event)
    ) {
      needsApproval = true;
    }
    // Unknown tools (extension/custom) → auto-approve
    if (!needsApproval) return;

    const sessionId =
      ctx.sessionManager.getSessionFile()?.split('/').pop()?.replace(/\.jsonl$/, '') ||
      'pi-unknown';

    const approved = await requestApproval(event.toolName, event.input, sessionId);
    if (!approved) {
      return { block: true, reason: `Denied by user via Telegram (${event.toolName})` };
    }
  });
}
