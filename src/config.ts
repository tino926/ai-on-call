import fs from 'fs';
import path from 'path';
import toml from 'toml';
import { logger } from './utils/logger.js';
import { getConfigDir } from './utils/paths.js';
import { ConfigValidator } from './utils/config-validator.js';
import { ConfigError, ValidationError } from './errors.js';
import { t, type Language } from './i18n.js';

export interface BotConfig {
  token: string;
  allowedUserId: number;
}

export interface RuntimeConfig {
  default: string;
  workDir: string;
}

export interface HookConfig {
  host: string;
  port: number;
  opencodeHttpPort: number;
  timeoutSec: number;
}

export interface LoggingConfig {
  level: string;
}

export interface Config {
  bot: BotConfig;
  runtime: RuntimeConfig;
  hook: HookConfig;
  logging: LoggingConfig;
}

function createConfigFromParsed(parsed: any): Config {
  return {
    bot: {
      token: parsed.bot?.token || '',
      allowedUserId: parsed.bot?.allowed_user_id || 0,
    },
    runtime: {
      default: parsed.runtime?.default || 'claude',
      workDir: path.resolve(parsed.runtime?.work_dir || process.cwd()),
    },
    hook: {
      host: parsed.hook?.host || '127.0.0.1',
      port: parsed.hook?.port || 9876,
      opencodeHttpPort: parsed.hook?.opencode_http_port || 3001,
      timeoutSec: parsed.hook?.timeout_sec || 300,
    },
    logging: {
      level: parsed.logging?.level || 'info',
    },
  };
}

function loadFromToml(filePath: string, lang: Language = 'zh-TW'): Config {
  logger.info('Loading configuration', { filePath });

  if (!fs.existsSync(filePath)) {
    throw new ConfigError(
      t('config.errors.fileNotFound', lang, { path: filePath }),
      { path: filePath }
    );
  }

  let parsed: any;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    parsed = toml.parse(content);
  } catch (error) {
    throw new ConfigError(
      t('config.errors.parseFailed', lang),
      {
        message: error instanceof Error ? error.message : String(error),
        path: filePath,
      }
    );
  }

  try {
    ConfigValidator.validate(parsed);
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error('Configuration validation failed', {
        field: error.field,
        value: error.value,
        constraint: error.constraint,
      });

      throw new ConfigError(
        t('config.errors.validationFailed', lang, {
          field: error.field,
          value: String(error.value),
          constraint: error.constraint || '',
        }),
        {
          originalError: error.message,
          field: error.field,
          value: error.value,
        }
      );
    }
    throw error;
  }

  return createConfigFromParsed(parsed);
}

export function loadConfig(lang: Language = 'zh-TW'): Config {
  const configDir = getConfigDir();
  const configPath = path.join(configDir, 'config.toml');
  return loadFromToml(configPath, lang);
}
