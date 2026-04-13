import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { LOG_FILE } from './paths.js';

const { combine, timestamp, printf, colorize } = winston.format;

// 確保日誌目錄存在
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create logs directory, using temp:', error);
  }
}

const logFilename = path.basename(LOG_FILE, '.log');
const errorLogFile = path.join(logDir, `${logFilename}-error.log`);

const logFormat = printf(({ level, message, timestamp, label, stack }) => {
  let output = `${timestamp} [${label || 'ai-on-call'}] ${level}: ${message}`;
  // 如果有 stack（錯誤），添加到輸出
  if (stack) {
    output += `\n${stack}`;
  }
  return output;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        colorize(),
        logFormat
      ),
    }),
    new winston.transports.File({
      filename: LOG_FILE,
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 14,
    }),
    new winston.transports.File({
      filename: errorLogFile,
      level: 'error',
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 14,
    }),
  ],
});
