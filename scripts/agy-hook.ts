#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const HOOK_SERVER_HOST = process.env.HOOK_SERVER_HOST || '127.0.0.1';
const HOOK_SERVER_PORT = parseInt(process.env.HOOK_SERVER_PORT || '9877', 10);
const APPROVAL_TIMEOUT_SEC = parseInt(process.env.APPROVAL_TIMEOUT_SEC || '300', 10);

// Must match the runtime's state path (src/runtime/antigravity.ts). The runtime
// passes AI_ON_CALL_CONVERSATION_STATE through agy's env; the default matches
// the global-install layout (~/.ai-on-call/data).
function getConversationStatePath(): string {
  return process.env.AI_ON_CALL_CONVERSATION_STATE
    || path.join(os.homedir(), '.ai-on-call', 'data', 'agy-conversation-id');
}

function recordConversationId(conversationId: unknown): void {
  if (typeof conversationId !== 'string' || !conversationId) return;
  try {
    const file = getConversationStatePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, conversationId);
  } catch (err) {
    // Best-effort: never fail the hook because of state recording
    console.error('[agy-hook] failed to record conversationId:', err);
  }
}

const autoApproveTools = ['read', 'glob', 'grep', 'search', 'webfetch', 'list_permissions'];

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
      session_id: sessionId,
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

function extractToolAndParams(data: any): { tool: string; params: string } {
  const toolCall = data.toolCall || {};
  let tool = toolCall.name || 'unknown';
  const args = toolCall.args || {};

  // Normalize tool names: agy uses snake_case like run_command, view_file
  // Map to our convention
  const toolNameMap: Record<string, string> = {
    'run_command': 'Bash',
    'write_to_file': 'Write',
    'replace_file_content': 'Edit',
    'multi_replace_file_content': 'Edit',
    'view_file': 'Read',
    'list_dir': 'Glob',
    'find_by_name': 'Glob',
    'grep_search': 'Grep',
    'search_web': 'Search',
    'read_url_content': 'WebFetch',
  };
  tool = toolNameMap[tool] || tool;

  const params = JSON.stringify(args);
  return { tool, params };
}

async function main(): Promise<void> {
  let input = '';

  process.stdin.on('data', (chunk) => {
    input += chunk.toString();
  });

  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);

      // Capture the conversation id on every hook event (PreToolUse, Stop, ...)
      // so the runtime can resume the conversation with --conversation
      recordConversationId(data.conversationId);

      if (!data.toolCall) {
        console.log(JSON.stringify({ decision: 'allow' }));
        process.exit(0);
        return;
      }

      const { tool, params } = extractToolAndParams(data);

      if (autoApproveTools.some((t) => tool.toLowerCase().includes(t))) {
        console.log(JSON.stringify({ decision: 'allow' }));
        process.exit(0);
        return;
      }

      const workspacePaths = data.workspacePaths || [];
      const sessionId = data.conversationId || workspacePaths.join(',') || `agy-${Date.now()}`;

      const approved = await waitForApproval(tool, params, sessionId);

      if (approved) {
        console.log(JSON.stringify({ decision: 'allow' }));
      } else {
        console.log(JSON.stringify({ decision: 'deny', reason: 'Approval request timed out or was denied' }));
      }
      process.exit(0);
    } catch (error) {
      console.error('Hook error:', error);
      console.log(JSON.stringify({ decision: 'allow' }));
      process.exit(0);
    }
  });
}

main();
