import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalStore } from '../src/approval.js';

describe('ApprovalStore', () => {
  let store: ApprovalStore;

  beforeEach(() => {
    store = new ApprovalStore();
  });

  it('應該註冊並等待審批請求', async () => {
    const request = { id: 'test', tool: 'Bash', params: '{}', createdAt: new Date() };

    const promise = store.register(request, 300);

    expect(store.complete('test', true)).toBe(true);

    const result = await promise;
    expect(result).toBe(true);
  });

  it('應該在用戶拒絕時返回 false', async () => {
    const request = { id: 'test', tool: 'Bash', params: '{}', createdAt: new Date() };

    const promise = store.register(request, 300);

    expect(store.complete('test', false)).toBe(true);

    const result = await promise;
    expect(result).toBe(false);
  });

  it('應該在超時時自動拒絕', async () => {
    vi.useFakeTimers();

    const request = { id: 'test', tool: 'Bash', params: '{}', createdAt: new Date() };
    const promise = store.register(request, 1);

    vi.advanceTimersByTime(1001);

    const result = await promise;
    expect(result).toBe(false);

    vi.useRealTimers();
  });

  it('應該處理不存在的請求', () => {
    expect(store.complete('nonexistent', true)).toBe(false);
  });
});
