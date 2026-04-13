import { loadConfig, Config } from './config.js';
import { createBot } from './bot/index.js';
import { BotState } from './state.js';
import { HookServer } from './hook-server.js';
import { OpenCodeHookServer } from './opencode-hook-server.js';
import { ensureOpenCodePlugin } from './opencode-plugin.js';
import { ensureDirectories } from './utils/paths.js';
import { handleStatus, handlePwd, handleCd, handleLs, handleSessions, handleNew, handleRestart, handleRuntime, handleLang } from './bot/commands.js';
import { handleMessage, handlePhoto } from './bot/handlers.js';
import { handleCallback } from './bot/callbacks.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  // Ensure required directories exist
  ensureDirectories();

  // Load configuration
  const config: Config = loadConfig('zh-TW');

  // Ensure OpenCode plugin is installed
  ensureOpenCodePlugin();

  // Set log level
  logger.level = config.logging.level;

  logger.info('Starting ai-on-call...');
  logger.info(`Work dir: ${config.runtime.workDir}`);
  logger.info(`Default runtime: ${config.runtime.default}`);
  logger.info(`Hook server: ${config.hook.host}:${config.hook.port}`);

  // Create bot
  const bot = createBot(config);

  // Create shared state
  const state = new BotState(config);

  // Log all updates for debugging
  bot.use(async (ctx, next) => {
    logger.info(`Received update: ${JSON.stringify({
      update_id: (ctx.update as any).update_id,
      from: ctx.from?.id,
      chat: ctx.chat?.id,
      text: (ctx.message as any)?.text,
    })}`);
    await next();
  });

  // Register command handlers
  bot.command('status', (ctx) => handleStatus(ctx, state));
  bot.command('pwd', (ctx) => handlePwd(ctx, state));
  bot.command('cd', (ctx) => handleCd(ctx, state));
  bot.command('ls', (ctx) => handleLs(ctx, state));
  bot.command('sessions', (ctx) => handleSessions(ctx, state));
  bot.command('new', (ctx) => handleNew(ctx, state));
  bot.command('restart', (ctx) => handleRestart(ctx, state));
  bot.command('runtime', (ctx) => handleRuntime(ctx, state));
  bot.command('lang', (ctx) => handleLang(ctx));

  // Register message handlers
  bot.on('text', (ctx) => handleMessage(ctx, state));
  bot.on('photo', (ctx) => handlePhoto(ctx, state));

  // Register callback handler
  bot.on('callback_query', (ctx) => handleCallback(ctx, state));

  // Start hook server
  const hookServer = new HookServer(
    config.hook.host,
    config.hook.port,
    config.hook.timeoutSec,
    config.bot.allowedUserId,
    state.approvalStore
  );

  await hookServer.start(bot);
  logger.info('Hook server started');

  // Start OpenCode HTTP hook server
  const opencodeHookServer = new OpenCodeHookServer(
    config.hook.host,
    config.hook.opencodeHttpPort,
    config.hook.timeoutSec,
    config.bot.allowedUserId,
    state.approvalStore
  );

  await opencodeHookServer.start(bot);
  logger.info(`OpenCode hook server started on port ${config.hook.opencodeHttpPort}`);

  // Make hookServer accessible for restart
  (global as any).hookServer = hookServer.getServer();
  (global as any).bot = bot;

  // Start bot
  logger.info('Bot started. Waiting for messages...');

  await bot.launch({
    // Drop pending updates to avoid restart loop
    dropPendingUpdates: true,
  });

  // Handle graceful shutdown
  process.once('SIGINT', () => {
    logger.info('Shutting down...');
    bot.stop('SIGINT');
    hookServer.getServer().close();
    opencodeHookServer.getServer().close();
    process.exit(0);
  });

  process.once('SIGTERM', () => {
    logger.info('Shutting down...');
    bot.stop('SIGTERM');
    hookServer.getServer().close();
    opencodeHookServer.getServer().close();
    process.exit(0);
  });
}

// Run
main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`);
  logger.error(error.stack);
  process.exit(1);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  logger.error(error.stack);
  process.exit(1);
});
