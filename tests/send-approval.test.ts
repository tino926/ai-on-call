import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendApprovalRequest } from '../src/utils/send-approval.js';
import { ApprovalStore } from '../src/approval.js';

function createMockBot() {
  return {
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    },
  };
}

function waitForRequest(store: ApprovalStore, id: string): Promise<void> {
  return new Promise((resolve) => {
    const onReq = (req: { id: string }) => {
      if (req.id === id) {
        store.off('request', onReq);
        resolve();
      }
    };
    store.on('request', onReq);
  });
}

describe('sendApprovalRequest', () => {
  let store: ApprovalStore;
  let mockBot: ReturnType<typeof createMockBot>;

  beforeEach(() => {
    store = new ApprovalStore();
    mockBot = createMockBot();
  });

  it('sends message with HTML parse_mode', async () => {
    const waited = waitForRequest(store, 'test-1');
    const promise = sendApprovalRequest({
      bot: mockBot as any,
      approvalStore: store,
      allowedUserId: 123456789,
      lang: 'en',
      timeoutSec: 10,
      request: { id: 'test-1', tool: 'Bash', params: JSON.stringify({ command: 'ls' }) },
    });
    await waited;
    store.complete('test-1', true);

    await expect(promise).resolves.toBe(true);
    expect(mockBot.telegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('<code>'),
      expect.objectContaining({ parse_mode: 'HTML' })
    );
  });

  it('returns false when sendMessage throws', async () => {
    mockBot.telegram.sendMessage.mockRejectedValueOnce(new Error('Network error'));

    const result = await sendApprovalRequest({
      bot: mockBot as any,
      approvalStore: store,
      allowedUserId: 123456789,
      lang: 'en',
      timeoutSec: 10,
      request: { id: 'test-2', tool: 'Bash', params: JSON.stringify({ command: 'ls' }) },
    });

    expect(result).toBe(false);
  });

  it('returns false when approval times out', async () => {
    const shortStore = new ApprovalStore();
    const result = await sendApprovalRequest({
      bot: mockBot as any,
      approvalStore: shortStore,
      allowedUserId: 123456789,
      lang: 'en',
      timeoutSec: 1,
      request: { id: 'test-3', tool: 'Bash', params: JSON.stringify({ command: 'ls' }) },
    });

    expect(result).toBe(false);
  }, 5000);

  it('includes tool name in message', async () => {
    const waited = waitForRequest(store, 'test-4');
    const promise = sendApprovalRequest({
      bot: mockBot as any,
      approvalStore: store,
      allowedUserId: 123456789,
      lang: 'en',
      timeoutSec: 10,
      request: { id: 'test-4', tool: 'Write', params: JSON.stringify({ file_path: '/tmp/test.txt' }) },
    });
    await waited;
    store.complete('test-4', true);
    await promise;

    expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('Write'),
      expect.any(Object)
    );
  });

  it('includes detail for known tools', async () => {
    const waited = waitForRequest(store, 'test-5');
    const promise = sendApprovalRequest({
      bot: mockBot as any,
      approvalStore: store,
      allowedUserId: 123456789,
      lang: 'en',
      timeoutSec: 10,
      request: { id: 'test-5', tool: 'Bash', params: JSON.stringify({ command: 'rm -rf /' }) },
    });
    await waited;
    store.complete('test-5', true);
    await promise;

    expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('rm -rf /'),
      expect.any(Object)
    );
  });

  it('includes titlePrefix when provided', async () => {
    const waited = waitForRequest(store, 'test-6');
    const promise = sendApprovalRequest({
      bot: mockBot as any,
      approvalStore: store,
      allowedUserId: 123456789,
      lang: 'en',
      timeoutSec: 10,
      request: { id: 'test-6', tool: 'Bash', params: JSON.stringify({ command: 'ls' }) },
      titlePrefix: 'OpenCode',
    });
    await waited;
    store.complete('test-6', true);
    await promise;

    expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
      123456789,
      expect.stringContaining('OpenCode'),
      expect.any(Object)
    );
  });
});