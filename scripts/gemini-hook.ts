#!/usr/bin/env node

import http from 'http';

const HOOK_SERVER_HOST = process.env.HOOK_SERVER_HOST || '127.0.0.1';
const HOOK_SERVER_PORT = parseInt(process.env.HOOK_SERVER_PORT || '9877', 10);
const APPROVAL_TIMEOUT_SEC = parseInt(process.env.APPROVAL_TIMEOUT_SEC || '300', 10);

const autoApproveTools = ['read', 'glob', 'grep', 'search', 'webfetch', 'readfile', 'greptool', 'globtool'];

async function httpRequest(method: string, path: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOOK_SERVER_HOST,
      port: HOOK_SERVER_PORT,
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

async function waitForApproval(tool: string, params: string, sessionId: string): Promise<boolean> {
  const startTime = Date.now();
  const timeoutMs = APPROVAL_TIMEOUT_SEC * 1000;

  try {
    const { id } = await httpRequest('POST', '/api/approval/request', { 
      tool, 
      params,
      session_id: sessionId
    });

    while (Date.now() - startTime < timeoutMs) {
      const status = await httpRequest('GET', `/api/approval/${id}/status`);
      if (status.approved === true) return true;
      if (status.approved === false) return false;
      await new Promise((r) => setTimeout(r, 500));
    }

    return false;
  } catch (error) {
    console.error('Approval request failed:', error);
    return false;
  }
}

async function main(): Promise<void> {
  let input = '';

  process.stdin.on('data', (chunk) => {
    input += chunk.toString();
  });

  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
      const toolName = (data.tool_name || '').toLowerCase();

      if (autoApproveTools.some((t) => toolName.includes(t))) {
        console.log(JSON.stringify({ decision: 'allow' }));
        process.exit(0);
        return;
      }

      if (data.hook_event_name !== 'BeforeTool') {
        console.log(JSON.stringify({ decision: 'allow' }));
        process.exit(0);
        return;
      }

      const tool = data.tool_name || 'unknown';
      const params = JSON.stringify(data.tool_input || {});

      const approved = await waitForApproval(tool, params, data.session_id || 'unknown');

      if (approved) {
        console.log(JSON.stringify({ decision: 'allow' }));
        process.exit(0);
      } else {
        console.log(JSON.stringify({ decision: 'deny', reason: 'Approval request timed out or was denied' }));
        process.exit(2);
      }
    } catch (error) {
      console.error('Hook error:', error);
      console.log(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
    }
  });
}

main();
