import { Telegraf } from 'telegraf';
import { ApprovalStore, ApprovalRequest } from '../approval.js';
import { logger } from './logger.js';
import { t } from '../i18n.js';
import type { Language } from '../i18n.js';
import { buildApprovalMessage } from './approval-message.js';

interface SendApprovalParams {
  bot: Telegraf;
  approvalStore: ApprovalStore;
  allowedUserId: number;
  lang: Language;
  timeoutSec: number;
  request: { id: string; tool: string; params: string };
  titlePrefix?: string;
}

export async function sendApprovalRequest({
  bot,
  approvalStore,
  allowedUserId,
  lang,
  timeoutSec,
  request,
  titlePrefix,
}: SendApprovalParams): Promise<boolean> {
  const approvalRequest: ApprovalRequest = {
    id: request.id,
    tool: request.tool,
    params: request.params,
    createdAt: new Date(),
  };

  const keyboard = {
    inline_keyboard: [
      [
        { text: t('hooks.permission.allowButton', lang), callback_data: `approve:${request.id}` },
        { text: t('hooks.permission.denyButton', lang), callback_data: `deny:${request.id}` },
      ],
    ],
  };

  const text = buildApprovalMessage({
    tool: request.tool,
    params: request.params,
    lang,
    titlePrefix,
  });

  try {
    await bot.telegram.sendMessage(allowedUserId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (error: any) {
    logger.error(`Failed to send approval request: ${error.message}`);
    approvalStore.complete(request.id, false);
    return false;
  }

  try {
    const approved = await approvalStore.register(approvalRequest, timeoutSec);
    logger.info(`Approval result for ${request.id}: ${approved}`);
    return approved;
  } catch (error: any) {
    logger.warn(`Approval channel error for ${request.id}: ${error.message}`);
    return false;
  }
}
