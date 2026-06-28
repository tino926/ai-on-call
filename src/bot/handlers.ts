import { Context } from 'telegraf';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { BotState } from '../state.js';
import { logger } from '../utils/logger.js';
import { t, getUserLang } from '../i18n.js';
import { splitMessage } from '../utils/message-splitter.js';
import { retryWithBackoff, isRateLimitError } from '../utils/retry.js';

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
    const result = await retryWithBackoff(
      () => runtime.execute(
        prompt,
        state.workDir,
        state.sessionId,
        imagePaths
      ),
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
      await ctx.reply(chunk, { parse_mode: 'Markdown' });
    }
  } catch (error: any) {
    logger.error(`Runtime error: ${error.message}`);

    const isRateLimit = isRateLimitError(error.message);
    const errorText = isRateLimit
      ? t('errors.rateLimit', lang)
      : t('common.error', lang, { message: error.message });

    try {
      await ctx.telegram.editMessageText(
        chatId!,
        messageId,
        undefined,
        `${errorText}\n\n(${t('common.error', lang, { message: '' })})`
      );
    } catch {
      await ctx.reply(errorText);
    }
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
