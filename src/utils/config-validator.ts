import { ValidationError } from '../errors.js';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { logger } from './logger.js';

export class ConfigValidator {
  private static readonly MIN_TOKEN_LENGTH = 30;
  private static readonly MAX_TOKEN_LENGTH = 1000;
  private static readonly MIN_PORT = 1024;
  private static readonly MAX_PORT = 65535;
  private static readonly MIN_TIMEOUT = 30;
  private static readonly MAX_TIMEOUT = 3600;
  private static readonly VALID_RUNTIMES = ['claude', 'qwen', 'opencode'] as const;
  private static readonly VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;

  /**
   * 驗證基本配置
   */
  static validate(config: Record<string, unknown>): void {
    this.validateBotConfig(config.bot);
    this.validateRuntimeConfig(config.runtime);
    this.validateHookConfig(config.hook);
    this.validateLoggingConfig(config.logging);
  }

  /**
   * 驗證 Bot 配置
   */
  static validateBotConfig(bot: unknown): void {
    const cfg = bot as Record<string, unknown> | undefined;

    if (!cfg) {
      throw new ValidationError('Bot configuration is required', 'bot', null, 'missing');
    }

    if (!cfg.token) {
      throw new ValidationError('Bot token is required', 'bot.token', null, 'required');
    }

    const token = String(cfg.token).trim();
    if (token.length < this.MIN_TOKEN_LENGTH || token.length > this.MAX_TOKEN_LENGTH) {
      throw new ValidationError(
        `Bot token must be between ${this.MIN_TOKEN_LENGTH} and ${this.MAX_TOKEN_LENGTH} characters`,
        'bot.token',
        token.length,
        `length: [${this.MIN_TOKEN_LENGTH}, ${this.MAX_TOKEN_LENGTH}]`
      );
    }

    const userId = cfg.allowed_user_id;
    if (userId === 0) return;
    if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
      throw new ValidationError(
        'Bot allowed_user_id must be a positive integer (use 0 to disable restriction)',
        'bot.allowed_user_id',
        userId,
        'positive_integer_or_0'
      );
    }

    if (token.includes('your-telegram-bot-token')) {
      throw new ValidationError(
        'Bot token appears to be a placeholder',
        'bot.token',
        token,
        'invalid-placeholder'
      );
    }
  }

  /**
   * 驗證 Runtime 配置
   */
  static validateRuntimeConfig(runtime: unknown): void {
    const cfg = runtime as Record<string, unknown> | undefined;

    if (!cfg) {
      throw new ValidationError('Runtime configuration is required', 'runtime', null, 'missing');
    }

    if (cfg.default) {
      const defaultRuntime = cfg.default as string;
      if (!this.VALID_RUNTIMES.includes(defaultRuntime as typeof this.VALID_RUNTIMES[number])) {
        throw new ValidationError(
          `Invalid default runtime: ${defaultRuntime}. Supported: ${this.VALID_RUNTIMES.join(', ')}`,
          'runtime.default',
          defaultRuntime,
          `supported: ${this.VALID_RUNTIMES.join(', ')}`
        );
      }
    }

    if (cfg.work_dir) {
      const workDir = path.resolve(String(cfg.work_dir));

      if (!fs.existsSync(workDir)) {
        throw new ValidationError(
          `Work directory does not exist: ${workDir}`,
          'runtime.work_dir',
          cfg.work_dir,
          'exists'
        );
      }

      if (!fs.statSync(workDir).isDirectory()) {
        throw new ValidationError(
          `Work path is not a directory: ${workDir}`,
          'runtime.work_dir',
          cfg.work_dir,
          'directory'
        );
      }

      try {
        fs.accessSync(workDir, fs.constants.W_OK);
      } catch (error) {
        throw new ValidationError(
          `Work directory is not writable: ${workDir}`,
          'runtime.work_dir',
          cfg.work_dir,
          'writable'
        );
      }
    }
  }

  /**
   * 驗證 Hook 配置
   */
  static validateHookConfig(hook: unknown): void {
    const cfg = hook as Record<string, unknown> | undefined;

    if (!cfg) {
      throw new ValidationError('Hook configuration is required', 'hook', null, 'missing');
    }

    if (cfg.host) {
      const host = String(cfg.host);
      // Check for valid IP using net.isIP(), or validate hostname with regex
      const isValidIp = net.isIP(host) !== 0;
      const hostnameRegex = /^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]))*$/;
      const isValidHostname = hostnameRegex.test(host);
      
      if (!isValidIp && !isValidHostname) {
        throw new ValidationError(
          `Invalid hook host: ${host}`,
          'hook.host',
          host,
          'valid-hostname-or-ip'
        );
      }

      if (host !== '127.0.0.1' && host !== 'localhost') {
        logger.warn('Hook server is listening on a non-local host', {
          host,
          port: cfg.port,
        });
      }
    }

    if (cfg.port !== undefined && cfg.port !== null) {
      this.validatePort(cfg.port, 'hook.port', 'TCP server port');
    }

    if (cfg.opencode_http_port !== undefined && cfg.opencode_http_port !== null) {
      this.validatePort(cfg.opencode_http_port, 'hook.opencode_http_port', 'OpenCode HTTP server port');
    }

    if (cfg.timeout_sec !== undefined && cfg.timeout_sec !== null) {
      if (typeof cfg.timeout_sec !== 'number') {
        throw new ValidationError(
          'Hook timeout must be a number',
          'hook.timeout_sec',
          typeof cfg.timeout_sec,
          'number'
        );
      }

      if (!Number.isInteger(cfg.timeout_sec)) {
        throw new ValidationError(
          'Hook timeout must be an integer',
          'hook.timeout_sec',
          cfg.timeout_sec,
          'integer'
        );
      }

      if (cfg.timeout_sec < this.MIN_TIMEOUT || cfg.timeout_sec > this.MAX_TIMEOUT) {
        throw new ValidationError(
          `Hook timeout must be between ${this.MIN_TIMEOUT} and ${this.MAX_TIMEOUT} seconds`,
          'hook.timeout_sec',
          cfg.timeout_sec,
          `range: [${this.MIN_TIMEOUT}, ${this.MAX_TIMEOUT}]`
        );
      }
    }
  }

  /**
   * 驗證日誌配置
   */
  static validateLoggingConfig(logging: unknown): void {
    const cfg = logging as Record<string, unknown> | undefined;

    if (!cfg) return;

    if (cfg.level) {
      const level = String(cfg.level);
      if (!this.VALID_LOG_LEVELS.includes(level as typeof this.VALID_LOG_LEVELS[number])) {
        throw new ValidationError(
          `Invalid log level: ${level}. Supported: ${this.VALID_LOG_LEVELS.join(', ')}`,
          'logging.level',
          level,
          `supported: ${this.VALID_LOG_LEVELS.join(', ')}`
        );
      }
    }
  }

  /**
   * 驗證埠號
   */
  private static validatePort(port: unknown, fieldPath: string, fieldName: string): void {
    if (typeof port !== 'number') {
      throw new ValidationError(
        `${fieldName} must be a number`,
        fieldPath,
        typeof port,
        'number'
      );
    }

    if (!Number.isInteger(port)) {
      throw new ValidationError(
        `${fieldName} must be an integer`,
        fieldPath,
        port,
        'integer'
      );
    }

    if (port < this.MIN_PORT || port > this.MAX_PORT) {
      throw new ValidationError(
        `${fieldName} must be between ${this.MIN_PORT} and ${this.MAX_PORT}`,
        fieldPath,
        port,
        `range: [${this.MIN_PORT}, ${this.MAX_PORT}]`
      );
    }
  }
}
