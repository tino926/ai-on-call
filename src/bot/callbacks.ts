import { Context } from 'telegraf';
import * as fs from 'fs';
import * as path from 'path';
import { BotState } from '../state.js';
import { logger } from '../utils/logger.js';
import { listSessions, getRecentMessages, formatRecentMessages, getProjectSessionDir } from './commands.js';
import { t, getUserLang } from '../i18n.js';

export async function handleCallback(ctx: Context, state: BotState): Promise<void> {
  const callbackQuery = ctx.callbackQuery as any;
  const data = callbackQuery.data;

  if (!data) return;

  if (data.startsWith('cd:')) {
    await handleCdCallback(ctx, state, data.slice(3));
    return;
  }

  if (data.startsWith('session:')) {
    await handleSessionCallback(ctx, state, data.slice(8));
    return;
  }

  if (data.startsWith('summarize:')) {
    await handleSummarizeCallback(ctx, state, data.slice(10));
    return;
  }

  if (data.startsWith('approve:')) {
    await handleApproveCallback(ctx, state, data.slice(8));
    return;
  }

  if (data.startsWith('deny:')) {
    await handleDenyCallback(ctx, state, data.slice(5));
    return;
  }

  if (data.startsWith('runtime:')) {
    await handleRuntimeCallback(ctx, state, data.slice(8));
    return;
  }

  await ctx.answerCbQuery('Unknown action');
}

async function handleCdCallback(ctx: Context, state: BotState, targetPath: string): Promise<void> {
  const lang = getUserLang(ctx);
  try {
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
      await ctx.answerCbQuery(t('commands.cd.notFound', lang, { path: targetPath }));
      return;
    }

    state.workDir = targetPath;
    state.sessionId = undefined;

    await ctx.answerCbQuery(t('commands.cd.success', lang, { path: targetPath }));
    await ctx.editMessageText(t('commands.cd.success', lang, { path: targetPath }));
  } catch (error: any) {
    await ctx.answerCbQuery(t('common.error', lang, { message: error.message }));
  }
}

async function handleSessionCallback(ctx: Context, state: BotState, sessionId: string): Promise<void> {
  const lang = getUserLang(ctx);
  try {
    state.sessionId = sessionId;
    await ctx.answerCbQuery(t('callbacks.session.switched', lang, { sessionId: sessionId.slice(0, 8) }));

    const projectDir = getProjectSessionDir(state.workDir, state.runtimeName);
    const sessions = listSessions(projectDir, 100, state.runtimeName);
    const session = sessions.find((s: any) => s.id === sessionId);

    let text = t('callbacks.session.switched', lang, { sessionId: sessionId.slice(0, 8) });
    if (session?.firstMsg) {
      text += `\n${session.firstMsg}`;
    }

    const recent = getRecentMessages(projectDir, sessionId, 4, state.runtimeName);
    if (recent.length > 0) {
      text += `\n\n📋 最近互動：\n${formatRecentMessages(recent)}`;

      const sumData = `summarize:${sessionId}`;
      if (sumData.length <= 64) {
        await ctx.editMessageText(text, {
          reply_markup: {
            inline_keyboard: [[
              { text: '📝 產生摘要', callback_data: sumData },
            ]],
          },
        });
        return;
      }
    }

    await ctx.editMessageText(text);
  } catch (error: any) {
    logger.error(`Session callback error: ${error.message}`);
    await ctx.answerCbQuery(t('common.error', lang, { message: error.message }));
    await ctx.editMessageText(t('common.error', lang, { message: error.message }));
  }
}

async function handleSummarizeCallback(ctx: Context, state: BotState, sessionId: string): Promise<void> {
  const lang = getUserLang(ctx);
  await ctx.answerCbQuery();

  const projectDir = getProjectSessionDir(state.workDir, state.runtimeName);
  const recent = getRecentMessages(projectDir, sessionId, 10, state.runtimeName);

  if (recent.length === 0) {
    await ctx.editMessageText(t('callbacks.summarize.notFound', lang));
    return;
  }

  const conversation = recent
    .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 300)}`)
    .join('\n');

  const prompt = `用${lang === 'en' ? 'English' : '繁體中文'}，簡短摘要以下對話（3-5 句）：\n\n${conversation}`;

  await ctx.editMessageText(t('callbacks.summarize.loading', lang));

  try {
    const runtime = state.getRuntime();
    const result = await runtime.execute(prompt, state.workDir, sessionId);
    const summary = result.stdout || t('callbacks.summarize.notFound', lang);

    const maxLength = 4000;
    if (summary.length <= maxLength) {
      await ctx.editMessageText(t('callbacks.summarize.result', lang, { summary }));
    } else {
      const chunks = [];
      for (let i = 0; i < summary.length; i += maxLength) {
        chunks.push(summary.slice(i, i + maxLength));
      }
      
      await ctx.editMessageText(t('callbacks.summarize.chunkLabel', lang, { current: '1', total: String(chunks.length) }) + `\n\n${chunks[0]}`);
      
      for (let i = 1; i < chunks.length; i++) {
        if (ctx.chat) {
          await ctx.telegram.sendMessage(ctx.chat.id, t('callbacks.summarize.chunkLabel', lang, { current: String(i + 1), total: String(chunks.length) }) + `\n\n${chunks[i]}`);
        }
      }
    }
  } catch (error: any) {
    logger.error(`Summary error: ${error.message}`);
    
    const isRateLimit = error.message.includes('過於頻繁') || error.message.includes('rate limit');
    
    if (isRateLimit) {
      await ctx.editMessageText(t('errors.rateLimit', lang));
    } else {
      await ctx.editMessageText(t('callbacks.summarize.error', lang, { message: error.message }));
    }
  }
}

async function handleApproveCallback(ctx: Context, state: BotState, requestId: string): Promise<void> {
  const lang = getUserLang(ctx);
  const request = state.approvalStore.getRequest(requestId);
  const completed = state.approvalStore.complete(requestId, true);

  await ctx.answerCbQuery();

  logger.info(`Approval ${requestId} - Approved (sent: ${completed})`);

  const message = ctx.callbackQuery as any;
  if (message.message) {
    const toolInfo = request ? `Tool: ${escapeMarkdown(request.tool)}\n` : '';
    const params = request ? escapeMarkdown(request.params) : '';
    const newText = t('callbacks.approval.approved', lang, { toolInfo, params });

    await ctx.editMessageText(newText).catch(() => {});
  }
}

async function handleDenyCallback(ctx: Context, state: BotState, requestId: string): Promise<void> {
  const lang = getUserLang(ctx);
  const request = state.approvalStore.getRequest(requestId);
  const completed = state.approvalStore.complete(requestId, false);

  await ctx.answerCbQuery();

  logger.info(`Approval ${requestId} - Denied (sent: ${completed})`);

  const message = ctx.callbackQuery as any;
  if (message.message) {
    const toolInfo = request ? `Tool: ${escapeMarkdown(request.tool)}\n` : '';
    const params = request ? escapeMarkdown(request.params) : '';
    const newText = t('callbacks.approval.denied', lang, { toolInfo, params });

    await ctx.editMessageText(newText).catch(() => {});
  }
}

async function handleRuntimeCallback(ctx: Context, state: BotState, runtime: string): Promise<void> {
  const lang = getUserLang(ctx);
  
  if (!['claude', 'qwen', 'opencode'].includes(runtime)) {
    await ctx.answerCbQuery(t('commands.runtime.unsupported', lang));
    return;
  }

  state.runtimeName = runtime;
  state.clearRuntimeCache();

  let message = t('commands.runtime.switched', lang, { runtime });
  if (runtime === 'qwen') {
    message += t('commands.runtime.qwenWarning', lang);
  }
  if (runtime === 'opencode') {
    message += t('commands.runtime.opencodeWarning', lang);
  }

  await ctx.answerCbQuery(message);
  await ctx.editMessageText(message).catch(() => {});
}

// Helper functions

function escapeMarkdown(text: string): string {
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let result = text;
  for (const char of specialChars) {
    result = result.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
  }
  return result;
}
