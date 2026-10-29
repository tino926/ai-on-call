import { Context } from 'telegraf';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { BotState } from '../state.js';
import { logger } from '../utils/logger.js';
import { t, getUserLang } from '../i18n.js';
import { splitMessage } from '../utils/message-splitter.js';

interface MediaGroupBuffer {
  paths: string[];
  caption: string;
  timer: ReturnType<typeof setTimeout>;
}

const mediaGroupBuffers = new Map<string, MediaGroupBuffer>();
const MEDIA_GROUP_TIMEOUT_MS = 2000;

export async function handleMessage(ctx: Context, state: BotState): Promise<void> {
  const text = (ctx.message as any).text;
  if (!text) return;

  await sendToRuntime(ctx, state, text);
}

export async function handlePhoto(ctx: Context, state: BotState): Promise<void> {
  const lang = getUserLang(ctx);
  const message = ctx.message as any;
  const photo = message.photo?.[message.photo.length - 1];
  const caption = message.caption || '請描述這張圖片';
  const mediaGroupId = message.media_group_id as string | undefined;

  if (!photo) return;

  try {
    const file = await ctx.telegram.getFile(photo.file_id);
    if (!file.file_path) {
      await ctx.reply(t('errors.fileNotFound', lang, { path: 'image' }));
      return;
    }

    const tmpPath = path.join('/tmp', `${photo.file_id}_${Date.now()}.jpg`);
    const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`;

    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(tmpPath, response.data);

    if (mediaGroupId) {
      const existing = mediaGroupBuffers.get(mediaGroupId);
      if (existing) {
        clearTimeout(existing.timer);
        existing.paths.push(tmpPath);
        if (message.caption) existing.caption = message.caption;
        existing.timer = setTimeout(() => {
          processMediaGroup(ctx, state, mediaGroupId).catch(err => {
            logger.error(`Media group processing error: ${err.message}`);
          });
        }, MEDIA_GROUP_TIMEOUT_MS);
      } else {
        const timer = setTimeout(() => {
          processMediaGroup(ctx, state, mediaGroupId).catch(err => {
            logger.error(`Media group processing error: ${err.message}`);
          });
        }, MEDIA_GROUP_TIMEOUT_MS);
        mediaGroupBuffers.set(mediaGroupId, {
          paths: [tmpPath],
          caption,
          timer,
        });
      }
    } else {
      await sendToRuntime(ctx, state, caption, [tmpPath]);
    }
  } catch (error: any) {
    logger.error(`Failed to process photo: ${error.message}`);
    await ctx.reply(t('errors.unknown', lang, { message: error.message }));
  }
}

async function processMediaGroup(ctx: Context, state: BotState, mediaGroupId: string): Promise<void> {
  const buffer = mediaGroupBuffers.get(mediaGroupId);
  if (!buffer) return;

  mediaGroupBuffers.delete(mediaGroupId);

  if (buffer.paths.length === 0) return;

  await sendToRuntime(ctx, state, buffer.caption, buffer.paths);
}

async function sendToRuntime(
  ctx: Context,
  state: BotState,
  prompt: string,
  imagePaths?: string[]
): Promise<void> {
  const lang = getUserLang(ctx);

  if (state.allowedUserId !== 0 && ctx.from?.id !== state.allowedUserId) {
    await ctx.reply(t('errors.unauthorized', lang));
    return;
  }

  const status = state.sessionId ? 'Continuing session' : 'New session';
  const truncated = prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt;

  const statusMessage = await ctx.reply(`${status}: ${truncated}\n\n${t('common.loading', lang)}`);

  const chatId = ctx.chat?.id;
  const messageId = statusMessage.message_id;

  runtimeExecuteInBackground(
    state,
    prompt,
    imagePaths,
    chatId,
    messageId,
    ctx
  ).catch((error) => {
    logger.error(`Background execution error: ${error.message}`);
  });
}

async function runtimeExecuteInBackground(
  state: BotState,
  prompt: string,
  imagePaths: string[] | undefined,
  chatId: number | undefined,
  messageId: number,
  ctx: Context
): Promise<void> {
  const lang = getUserLang(ctx);

  const typingInterval = setInterval(() => {
    if (chatId) {
      ctx.telegram.sendChatAction(chatId, 'typing').catch(() => {});
    }
  }, 3000);

  try {
    const runtime = state.getRuntime();
    const result = await runtime.execute(
      prompt,
      state.workDir,
      state.sessionId,
      imagePaths
    );

    if (result.sessionId) {
      state.sessionId = result.sessionId;
    }

    const output = result.stdout || result.stderr || t('common.none', lang);

    try {
      await ctx.telegram.deleteMessage(chatId!, messageId);
    } catch {
      // Ignore if can't delete
    }

    for (const chunk of splitMessage(output)) {
      await ctx.reply(chunk, { parse_mode: 'HTML' });
    }
  } catch (error: any) {
    logger.error(`Runtime error: ${error.message}`);
    await reportExecutionFailure(ctx, state, prompt, error, chatId, messageId);
  } finally {
    clearInterval(typingInterval);
    if (imagePaths) {
      for (const p of imagePaths) {
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}

/**
 * Show the failure to the user with retry/dismiss buttons. No automatic retry
 * happens: the user decides whether to run the same prompt again.
 */
async function reportExecutionFailure(
  ctx: Context,
  state: BotState,
  prompt: string,
  error: Error,
  chatId: number | undefined,
  messageId: number
): Promise<void> {
  const lang = getUserLang(ctx);
  const token = state.addPendingRequest(prompt);
  const text = t('retry.failed', lang, { message: truncateError(error.message) });
  const extra = {
    reply_markup: {
      inline_keyboard: [[
        { text: t('retry.button', lang), callback_data: `retry:${token}` },
        { text: t('retry.dismissButton', lang), callback_data: `dismiss:${token}` },
      ]],
    },
  };

  try {
    await ctx.telegram.editMessageText(chatId!, messageId, undefined, text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}

/** Keep forwarded CLI errors readable and inside a single Telegram message. */
function truncateError(message: string): string {
  const MAX = 1500;
  return message.length <= MAX ? message : `${message.slice(0, MAX)}...`;
}

async function clearInlineKeyboard(ctx: Context): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch {
    // Message too old to edit, or markup already gone
  }
}

/** Re-run the prompt attached to a retry button, at the user's request. */
export async function retryPendingRequest(
  ctx: Context,
  state: BotState,
  token: string
): Promise<void> {
  const lang = getUserLang(ctx);
  const pending = state.takePendingRequest(token);

  if (!pending) {
    await ctx.answerCbQuery(t('retry.expired', lang));
    return;
  }

  await ctx.answerCbQuery();
  await clearInlineKeyboard(ctx);

  const status = await ctx.reply(t('retry.running', lang));
  await runtimeExecuteInBackground(
    state,
    pending.prompt,
    undefined,
    ctx.chat?.id,
    status.message_id,
    ctx
  );
}

/** Drop the pending request behind a retry button. */
export async function dismissPendingRequest(
  ctx: Context,
  state: BotState,
  token: string
): Promise<void> {
  state.takePendingRequest(token);
  await ctx.answerCbQuery();
  await clearInlineKeyboard(ctx);
}

export function cleanupMediaGroupBuffers(): void {
  for (const [id, buffer] of mediaGroupBuffers) {
    clearTimeout(buffer.timer);
    for (const p of buffer.paths) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
  mediaGroupBuffers.clear();
}
