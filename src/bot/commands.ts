import { Context } from 'telegraf';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, execSync } from 'child_process';
import { BotState } from '../state.js';
import { logger } from '../utils/logger.js';
import { t, getUserLang, setUserLang } from '../i18n.js';

export async function handleStatus(ctx: Context, state: BotState): Promise<void> {
  logger.info(`Handling /status command for user ${ctx.from?.id}`);
  const lang = getUserLang(ctx);
  
  const status = [
    t('commands.status.title', lang),
    '',
    t('commands.status.workDir', lang, { workDir: state.workDir }),
    t('commands.status.session', lang, { sessionId: state.sessionId ? state.sessionId.slice(0, 8) : t('common.none', lang) }),
    t('commands.status.runtime', lang, { runtimeName: state.runtimeName }),
    t('commands.status.pendingApprovals', lang, { count: String(state.approvalStore.pendingCount) }),
  ].join('\n');

  await ctx.reply(status);
}

export async function handlePwd(ctx: Context, state: BotState): Promise<void> {
  const lang = getUserLang(ctx);
  await ctx.reply(t('commands.pwd.title', lang, { path: state.workDir }));
}

export async function handleCd(ctx: Context, state: BotState): Promise<void> {
  const lang = getUserLang(ctx);
  const args = (ctx.message as any).text?.split(' ').slice(1) || [];

  if (args.length === 0) {
    await handleLs(ctx, state);
    return;
  }

  const target = path.resolve(state.workDir, args[0]);

  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    await ctx.reply(t('commands.cd.notFound', lang, { path: target }));
    return;
  }

  state.workDir = target;
  state.sessionId = undefined;
  state.clearRuntimeCache();

  await ctx.reply(t('commands.cd.success', lang, { path: target }));
}

export async function handleLs(ctx: Context, state: BotState): Promise<void> {
  const lang = getUserLang(ctx);
  const args = (ctx.message as any).text?.split(' ').slice(1) || [];
  const target = args.length > 0 ? path.resolve(state.workDir, args[0]) : state.workDir;

  if (!fs.existsSync(target)) {
    await ctx.reply(t('commands.cd.notFound', lang, { path: target }));
    return;
  }

  try {
    const entries = fs.readdirSync(target);
    const dirNames = entries.filter(f => fs.statSync(path.join(target, f)).isDirectory()).sort();
    const fileNames = entries.filter(f => fs.statSync(path.join(target, f)).isFile()).sort();

    const buttons: any[] = [];
    
    const parent = path.dirname(target);
    if (parent !== target) {
      buttons.push([{
        text: '📁 ../',
        callback_data: `cd:${parent}`,
      }]);
    }

    for (const dir of dirNames) {
      const fullPath = path.join(target, dir);
      buttons.push([{
        text: `📁 ${dir}/`,
        callback_data: `cd:${fullPath}`,
      }]);
    }

    let text = `${target}\n\n`;
    if (fileNames.length === 0 && dirNames.length === 0) {
      text += t('commands.ls.empty', lang);
    } else {
      text += fileNames.map(f => `📄 ${f}`).join('\n');
    }

    await ctx.reply(text, {
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  } catch (error: any) {
    await ctx.reply(t('commands.ls.error', lang, { message: error.message }));
  }
}

export async function handleSessions(ctx: Context, state: BotState): Promise<void> {
  const lang = getUserLang(ctx);
  const projectDir = getProjectSessionDir(state.workDir, state.runtimeName);
  const sessions = listSessions(projectDir, 10, state.runtimeName);

  if (sessions.length === 0) {
    await ctx.reply(t('commands.sessions.empty', lang));
    return;
  }

  const buttons: any[] = [];
  for (const session of sessions) {
    const cbData = `session:${session.id}`;
    if (cbData.length <= 64) {
      const timeStr = session.time ? session.time.slice(0, 16).replace('T', ' ') : '?';
      const label = `[${timeStr}] ${session.firstMsg.slice(0, 30)}`;
      buttons.push([{
        text: label,
        callback_data: cbData,
      }]);
    }
  }

  const current = t('commands.status.session', lang, { sessionId: state.sessionId ? state.sessionId.slice(0, 8) : t('common.none', lang) });
  const text = t('commands.sessions.title', lang, { current });

  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: buttons,
    },
  });
}

export async function handleNew(ctx: Context, state: BotState): Promise<void> {
  const lang = getUserLang(ctx);
  state.sessionId = undefined;
  await ctx.reply(t('commands.new.success', lang));
}

export async function handleRestart(ctx: Context, _state: BotState): Promise<void> {
  const lang = getUserLang(ctx);
  await ctx.reply(t('commands.restart.message', lang));

  logger.info('Restarting bot...');

  // Stop bot to release Telegram long polling
  const bot = (global as any).bot;
  if (bot) {
    bot.stop('restart');
    logger.info('Bot stopped');
  }

  // Close hook server to release port
  const hookServer = (global as any).hookServer;
  if (hookServer) {
    hookServer.close();
    logger.info('Hook server closed');
  }

  // Spawn a new bot process
  const newProc = spawn('node', ['dist/index.js'], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
    },
  });

  newProc.unref();

  logger.info('New bot process spawned, PID:', newProc.pid);

  // Exit immediately
  process.exit(0);
}

export async function handleRuntime(ctx: Context, state: BotState): Promise<void> {
  const lang = getUserLang(ctx);
  const args = (ctx.message as any).text?.split(' ').slice(1) || [];
  
  if (args.length === 0) {
    const currentRuntime = state.runtimeName;
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🤖 Claude', callback_data: 'runtime:claude' },
          { text: '🧠 Qwen', callback_data: 'runtime:qwen' },
          { text: '⚡ OpenCode', callback_data: 'runtime:opencode' },
        ],
      ],
    };
    await ctx.reply(
      `${t('commands.runtime.current', lang, { runtime: currentRuntime })}\n\n${t('commands.runtime.selectPrompt', lang)}`,
      { reply_markup: keyboard }
    );
    return;
  }

  const runtime = args[0].toLowerCase();
  if (runtime === 'claude' || runtime === 'qwen' || runtime === 'opencode') {
    state.runtimeName = runtime;
    state.clearRuntimeCache();
    
    let message = t('commands.runtime.switched', lang, { runtime });
    if (runtime === 'qwen') {
      message += t('commands.runtime.qwenWarning', lang);
    }
    if (runtime === 'opencode') {
      message += t('commands.runtime.opencodeWarning', lang);
    }
    await ctx.reply(message);
  } else {
    await ctx.reply(t('commands.runtime.unsupported', lang));
  }
}

export async function handleLang(ctx: Context): Promise<void> {
  const lang = getUserLang(ctx);
  const args = (ctx.message as any).text?.split(' ').slice(1) || [];
  const userId = ctx.from?.id;
  
  if (args.length === 0) {
    await ctx.reply(t('commands.lang.current', lang, { lang }));
    return;
  }
  
  const targetLang = args[0].toLowerCase();
  let success = false;
  
  if (userId) {
    success = setUserLang(userId, targetLang);
  }
  
  if (success) {
    const langName = targetLang === 'zh-tw' ? '繁體中文' : targetLang === 'zh-cn' ? '簡體中文' : 'English';
    await ctx.reply(t('commands.lang.switched', lang, { lang: langName }));
  } else {
    await ctx.reply(t('commands.lang.unsupported', lang));
  }
}

// Helper functions

export function getProjectSessionDir(workDir: string, runtime: string = 'claude'): string {
  const safePath = workDir.replace(/\//g, '-').replace(/_/g, '-').replace(/^-/, '');
  
  if (runtime === 'qwen') {
    return path.join(process.env.HOME || '', '.qwen', 'projects', `-${safePath}`, 'chats');
  } else if (runtime === 'opencode') {
    // OpenCode stores sessions internally, return a placeholder
    return 'opencode';  // Not a real path
  } else {
    return path.join(process.env.HOME || '', '.claude', 'projects', `-${safePath}`);
  }
}

export function listSessions(projectDir: string, limit: number = 10, runtime: string = 'claude'): any[] {
  if (runtime === 'opencode') {
    return listOpenCodeSessions(limit);
  }
  
  const sessions: any[] = [];
  
  try {
    if (!fs.existsSync(projectDir)) {
      return [];
    }
    
    const files = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(projectDir, f));
    
    for (const filepath of files) {
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          const rec = JSON.parse(line);
          
          // Different session ID field for Claude vs Qwen
          const sessionId = rec.sessionId || rec.id;
          if (!sessionId) continue;
          
          // Different first message extraction for Claude vs Qwen
          let firstMsg = '';
          if (runtime === 'qwen') {
            // Qwen: rec.message.parts[].text
            firstMsg = Array.isArray(rec.message?.parts)
              ? rec.message.parts.filter((p: any) => p.text).map((p: any) => p.text).join('').slice(0, 80)
              : '';
          } else {
            // Claude: rec.message.content[].text
            firstMsg = Array.isArray(rec.message?.content)
              ? rec.message.content.filter((c: any) => c.text).map((c: any) => c.text).join('').slice(0, 80)
              : rec.message?.content || '';
          }
          
          if (rec.type === 'user' || runtime === 'qwen') {
            sessions.push({
              id: sessionId,
              time: rec.timestamp || rec.timestampMs || '',
              firstMsg: firstMsg,
            });
            break;
          }
        }
      } catch (e) {
        // Skip invalid files
      }
    }
  } catch (e) {
    logger.warn(`Failed to list sessions: ${e}`);
  }

  sessions.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  return sessions.slice(0, limit);
}

export function getRecentMessages(projectDir: string, sessionId: string, count: number = 4, runtime: string = 'claude'): any[] {
  const filepath = path.join(projectDir, `${sessionId}.jsonl`);
  if (!fs.existsSync(filepath)) {
    return [];
  }

  const messages: any[] = [];
  
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      
      if (runtime === 'qwen') {
        // Qwen format: rec.type = 'user' or 'system', rec.message.parts[]
        if (rec.type === 'user' || rec.type === 'system') {
          const content = Array.isArray(rec.message?.parts)
            ? rec.message.parts.filter((p: any) => p.text).map((p: any) => p.text).join(' ')
            : '';
          if (content) {
            messages.push({ role: rec.type, content });
          }
        }
      } else {
        // Claude format: rec.type = 'user' or 'assistant', rec.message.content[]
        if (rec.type === 'user' || rec.type === 'assistant') {
          const content = Array.isArray(rec.message?.content)
            ? rec.message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ')
            : rec.message?.content || '';
          
          if (content) {
            messages.push({ role: rec.type, content });
          }
        }
      }
    }
  } catch (e) {
    logger.warn(`Failed to read session: ${e}`);
  }

  return messages.slice(-count);
}

export function formatRecentMessages(messages: any[], maxChars: number = 80): string {
  return messages.map((m: any) => {
    const icon = m.role === 'user' ? '👤' : '🤖';
    const text = m.content.length > maxChars ? m.content.slice(0, maxChars) + '...' : m.content;
    return `${icon} ${text}`;
  }).join('\n\n');
}

function listOpenCodeSessions(limit: number): any[] {
  try {
    const stdout = execSync('opencode session list', { encoding: 'utf-8', timeout: 5000 });
    
    const sessions: any[] = [];
    const lines = stdout.split('\n').slice(2); // Skip header lines
    
    for (const line of lines) {
      if (!line.trim() || line.includes('────')) continue;
      
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length >= 3) {
        sessions.push({
          id: parts[0].trim(),
          firstMsg: parts[1].trim(),
          time: parts[2].trim(),
        });
      }
    }
    
    return sessions.slice(0, limit);
  } catch (e) {
    logger.warn(`Failed to list OpenCode sessions: ${e}`);
    return [];
  }
}

export function getOpenCodeRecentMessages(sessionId: string, count: number = 4): any[] {
  // OpenCode doesn't have a simple file-based message history
  // Return empty for now - messages are managed internally by OpenCode
  return [];
}
