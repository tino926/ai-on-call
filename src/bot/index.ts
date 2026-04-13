import { Telegraf } from 'telegraf';
import https from 'https';
import { Config } from '../config.js';
import { logger } from '../utils/logger.js';

export function createBot(config: Config): Telegraf {
  const bot = new Telegraf(config.bot.token, {
    handlerTimeout: 300000,
    telegram: {
      webhookReply: false,
      agent: new https.Agent({
        keepAlive: true,
        family: 4, // Force IPv4 to avoid IPv6 SSL issues
        minVersion: 'TLSv1.2', // Force TLS 1.2+ for Telegram API
      }),
    },
  });

  // Set commands
  bot.telegram.setMyCommands([
    { command: 'status', description: '顯示 bot 狀態' },
    { command: 'pwd', description: '顯示目前工作目錄' },
    { command: 'cd', description: '切換工作目錄' },
    { command: 'ls', description: '列出目錄內容' },
    { command: 'sessions', description: '列出最近的 sessions' },
    { command: 'new', description: '開啟新 session' },
    { command: 'restart', description: '重啟 bot' },
    { command: 'runtime', description: '切換 AI runtime' },
  ]).then(() => {
    logger.info('Bot commands registered');
  }).catch((err) => {
    logger.warn('Failed to set bot commands:', err);
  });

  return bot;
}
