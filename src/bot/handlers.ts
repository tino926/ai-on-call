import { Context } from 'telegraf';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { BotState } from '../state.js';
import { logger } from '../utils/logger.js';
import { t, getUserLang } from '../i18n.js';

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

    await sendToRuntime(ctx, state, caption, tmpPath);
  } catch (error: any) {
    logger.error(`Failed to process photo: ${error.message}`);
    await ctx.reply(t('errors.unknown', lang, { message: error.message }));
  }
}

async function sendToRuntime(
  ctx: Context,
  state: BotState,
  prompt: string,
  imagePath?: string
): Promise<void> {
  const lang = getUserLang(ctx);

  if (state.allowedUserId !== 0 && ctx.from?.id !== state.allowedUserId) {
    await ctx.reply(t('errors.unauthorized', lang));
    return;
  }

  const status = state.sessionId ? 'Continuing session' : 'New session';
  const truncated = prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt;
  
  const statusMessage = await ctx.reply(`${status}: ${truncated}\n\n${t('common.loading', lang)}`);

  // Run in background to avoid blocking handler
  const chatId = ctx.chat?.id;
  const messageId = statusMessage.message_id;

  runtimeExecuteInBackground(
    state,
    prompt,
    imagePath,
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
  imagePath: string | undefined,
  chatId: number | undefined,
  messageId: number,
  ctx: Context
): Promise<void> {
  const lang = getUserLang(ctx);
  
  // Send typing indicator
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
      imagePath
    );

    if (result.sessionId) {
      state.sessionId = result.sessionId;
    }

    const output = result.stdout || result.stderr || t('common.none', lang);

    // Delete the "processing" message and send response
    try {
      await ctx.telegram.deleteMessage(chatId!, messageId);
    } catch {
      // Ignore if can't delete
    }

    const chunkSize = 4000;
    for (let i = 0; i < output.length; i += chunkSize) {
      const chunk = output.slice(i, i + chunkSize);
      await ctx.reply(chunk);
    }
  } catch (error: any) {
    logger.error(`Runtime error: ${error.message}`);
    
    const isRateLimit = error.message.includes('過於頻繁') || error.message.includes('rate limit');
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
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
}
