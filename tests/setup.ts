import { vi } from 'vitest';

// 全局 mock
global.fetch = vi.fn();

// Mock logger (全局)
vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
