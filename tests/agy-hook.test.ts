import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import { ApprovalApiServer } from '../src/approval-api-server.js';
import { ApprovalStore } from '../src/approval.js';

const TSX_BIN = path.resolve('node_modules', '.bin', 'tsx');
const HOOK_SCRIPT = path.resolve('scripts', 'agy-hook.ts');

function createMockBot() {
  return {
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    },
  };
}

type MockBot = ReturnType<typeof createMockBot>;

interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runHook(port: number, input: string, approvalTimeoutSec = 5): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [TSX_BIN, HOOK_SCRIPT], {
      env: {
        ...process.env,
        HOOK_SERVER_HOST: '127.0.0.1',
        HOOK_SERVER_PORT: String(port),
        APPROVAL_TIMEOUT_SEC: String(approvalTimeoutSec),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => resolve({ stdout, stderr, code }));
    proc.on('error', reject);

    proc.stdin.write(input);
    proc.stdin.end();
  });
}

function extractApprovalId(mockBot: MockBot): string {
  const calls = mockBot.telegram.sendMessage.mock.calls;
  const opts = calls.at(-1)![2] as any;
  const callbackData = opts.reply_markup.inline_keyboard[0][0].callback_data as string;
  return callbackData.split(':')[1];
}

describe('E2E: Antigravity hook bridge (agy-hook.ts)', () => {
  let store: ApprovalStore;
  let server: ApprovalApiServer;
  let httpServer: any;
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

  it('should allow auto-approved tools without contacting the approval server', async () => {
    const input = JSON.stringify({
      toolCall: { name: 'view_file', args: { AbsolutePath: '/tmp/file.txt' } },
      stepIdx: 1,
      conversationId: 'conv-1',
      workspacePaths: ['/workspace/project'],
    });

    const result = await runHook(port, input);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ decision: 'allow' });
    expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('should allow tools when toolCall is missing (defensive default)', async () => {
    const result = await runHook(port, JSON.stringify({ someOtherEvent: true }));

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ decision: 'allow' });
  });

  it('should allow on invalid JSON input with exit code 0', async () => {
    const result = await runHook(port, 'not-json{{{');

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ decision: 'allow' });
  });

  it('should ask for approval on run_command and allow when approved', async () => {
    const input = JSON.stringify({
      toolCall: { name: 'run_command', args: { CommandLine: 'npm test', Cwd: '/workspace/project' } },
      stepIdx: 3,
      conversationId: 'conv-approve',
      workspacePaths: ['/workspace/project'],
    });

    const pending = runHook(port, input, 10);

    await vi.waitFor(() => {
      expect(mockBot.telegram.sendMessage).toHaveBeenCalled();
    }, { timeout: 5000, interval: 50 });

    const id = extractApprovalId(mockBot);
    expect(id).toContain('conv-approve');

    store.complete(id, true);

    const result = await pending;
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ decision: 'allow' });
  });

  it('should deny when approval is rejected', async () => {
    const input = JSON.stringify({
      toolCall: { name: 'run_command', args: { CommandLine: 'rm -rf /', Cwd: '/workspace/project' } },
      stepIdx: 4,
      conversationId: 'conv-deny',
      workspacePaths: ['/workspace/project'],
    });

    const pending = runHook(port, input, 10);

    await vi.waitFor(() => {
      expect(mockBot.telegram.sendMessage).toHaveBeenCalled();
    }, { timeout: 5000, interval: 50 });

    const id = extractApprovalId(mockBot);
    store.complete(id, false);

    const result = await pending;
    expect(result.code).toBe(0);
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toBeDefined();
  });

  it('should use conversationId as session id in the approval request', async () => {
    const input = JSON.stringify({
      toolCall: { name: 'run_command', args: { CommandLine: 'echo hi', Cwd: '/workspace/project' } },
      stepIdx: 5,
      conversationId: 'uuid-conv-123',
      workspacePaths: ['/workspace/project'],
    });

    const pending = runHook(port, input, 10);

    await vi.waitFor(() => {
      expect(mockBot.telegram.sendMessage).toHaveBeenCalled();
    }, { timeout: 5000, interval: 50 });

    store.complete(extractApprovalId(mockBot), true);
    await pending;
  });

  it('should auto-deny when approval times out', async () => {
    const input = JSON.stringify({
      toolCall: { name: 'run_command', args: { CommandLine: 'sleep 100', Cwd: '/workspace/project' } },
      stepIdx: 6,
      conversationId: 'conv-timeout',
      workspacePaths: ['/workspace/project'],
    });

    const result = await runHook(port, input, 1);

    expect(result.code).toBe(0);
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toBeDefined();
  });
});
