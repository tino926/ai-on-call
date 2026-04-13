import { describe, it, expect } from 'vitest';
import { AppError, ConfigError, ValidationError, RuntimeError, AuthError, ServiceError } from '../src/errors.js';

describe('Errors', () => {
  describe('AppError', () => {
    it('應該創建基礎錯誤', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 500);
      expect(error.name).toBe('AppError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('應該有預設狀態碼 500', () => {
      const error = new AppError('Test error', 'TEST_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('應該包含 details', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 400, { field: 'test' });
      expect(error.details).toEqual({ field: 'test' });
    });
  });

  describe('ConfigError', () => {
    it('應該創建配置錯誤', () => {
      const error = new ConfigError('Invalid config', { field: 'bot.token' });
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'bot.token' });
    });
  });

  describe('ValidationError', () => {
    it('應該創建驗證錯誤', () => {
      const error = new ValidationError('Invalid value', 'bot.token', 'short', 'min_length');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.field).toBe('bot.token');
      expect(error.value).toBe('short');
      expect(error.constraint).toBe('min_length');
    });

    it('details 應該包含 field, value, constraint', () => {
      const error = new ValidationError('Invalid', 'hook.port', 99999, 'range');
      expect(error.details).toEqual({ field: 'hook.port', value: 99999, constraint: 'range' });
    });
  });

  describe('RuntimeError', () => {
    it('應該創建 Runtime 錯誤', () => {
      const error = new RuntimeError('Runtime failed', { runtime: 'claude' });
      expect(error.code).toBe('RUNTIME_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('AuthError', () => {
    it('應該創建認證錯誤', () => {
      const error = new AuthError('Unauthorized');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('應該有預設訊息', () => {
      const error = new AuthError();
      expect(error.message).toBe('Unauthorized access');
    });
  });

  describe('ServiceError', () => {
    it('應該創建服務錯誤', () => {
      const error = new ServiceError('Service unavailable', { service: 'telegram' });
      expect(error.code).toBe('SERVICE_ERROR');
      expect(error.statusCode).toBe(503);
    });
  });
});
