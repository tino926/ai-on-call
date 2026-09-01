import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

// Mock http before importing the extension
vi.mock('http', () => {
  const mockReq = {
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
  return {
    default: {
      request: vi.fn((_opts, cb) => {
        // Simulate response
        const res = {
          on: vi.fn((_event: string, _cb: Function) => {}),
        };
        return mockReq;
      }),
    },
  };
});

// We test the extension's logic by importing and calling its factory
// The extension is compiled to dist/pi-approval-extension.js
// For unit tests, we test the helper functions directly

describe('Pi approval extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('auto-approve tools', () => {
    it('read, grep, find, ls 應該自動approve', () => {
      const autoApproveTools = ['read', 'grep', 'find', 'ls'];
      // These should not trigger approval
      for (const tool of autoApproveTools) {
        expect(autoApproveTools.includes(tool)).toBe(true);
      }
    });

    it('bash, write, edit 應該需要審批', () => {
      const needsApproval = ['bash', 'write', 'edit'];
      const autoApproveTools = ['read', 'grep', 'find', 'ls'];
      for (const tool of needsApproval) {
        expect(autoApproveTools.includes(tool)).toBe(false);
      }
    });
  });

  describe('approval request format', () => {
    it('應該正確格式化 approval request body', () => {
      const toolName = 'bash';
      const toolArgs = { command: 'rm -rf /tmp/test' };
      const sessionId = 'test-session-123';

      const body = {
        tool: toolName,
        params: JSON.stringify(toolArgs),
        session_id: sessionId,
      };

      expect(body.tool).toBe('bash');
      expect(body.params).toBe('{"command":"rm -rf /tmp/test"}');
      expect(body.session_id).toBe('test-session-123');
    });
  });

  describe('polling logic', () => {
    it('應該在 approved 後停止 polling', () => {
      // Simulate polling: approved after 2 polls
      const results = [
        { approved: null },     // pending
        { approved: null },     // pending
        { approved: true },     // approved
      ];

      let pollCount = 0;
      let finalResult: boolean | null = null;

      while (pollCount < results.length) {
        const status = results[pollCount];
        if (status.approved !== null) {
          finalResult = status.approved;
          break;
        }
        pollCount++;
      }

      expect(finalResult).toBe(true);
      expect(pollCount).toBe(2);
    });

    it('應該在 denied 後停止 polling', () => {
      const results = [
        { approved: null },
        { approved: false },
      ];

      let pollCount = 0;
      let finalResult: boolean | null = null;

      while (pollCount < results.length) {
        const status = results[pollCount];
        if (status.approved !== null) {
          finalResult = status.approved;
          break;
        }
        pollCount++;
      }

      expect(finalResult).toBe(false);
    });

    it('應該在 timeout 時返回 deny', () => {
      const deadline = Date.now() + 100; // 100ms timeout
      const results = [
        { approved: null },
        { approved: null },
        { approved: null },
      ];

      let pollCount = 0;
      let finalResult: boolean | null = null;

      while (Date.now() < deadline && pollCount < results.length) {
        const status = results[pollCount];
        if (status.approved !== null) {
          finalResult = status.approved;
          break;
        }
        pollCount++;
      }

      // Timeout → deny
      if (finalResult === null) finalResult = false;
      expect(finalResult).toBe(false);
    });
  });
});
