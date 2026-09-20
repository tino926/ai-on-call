import net from 'net';
import { ApprovalStore, ApprovalRequest } from './approval.js';
import { Telegraf } from 'telegraf';
import { logger } from './utils/logger.js';
import { t } from './i18n.js';
import { parseToolDetail } from './utils/tool-detail.js';

type Language = 'zh-TW' | 'zh-CN' | 'en' | 'ja' | 'ko';
const DEFAULT_LANG: Language = 'zh-TW';

interface HookRequest {
  id: string;
  tool: string;
  params: string;
}

interface HookResponse {
  approved: boolean;
}

export class HookServer {
  private server: net.Server;
  private host: string;
  private port: number;
  private timeoutSec: number;
  private allowedUserId: number;
  private lang: Language = DEFAULT_LANG;

  constructor(
    host: string,
    port: number,
    timeoutSec: number,
    allowedUserId: number,
    private approvalStore: ApprovalStore
  ) {
    this.host = host;
    this.port = port;
    this.timeoutSec = timeoutSec;
    this.allowedUserId = allowedUserId;
    this.server = net.createServer();
  }

  setLanguage(lang: Language): void {
    this.lang = lang;
  }

  getServer(): net.Server {
    return this.server;
  }

  start(bot: Telegraf): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on('connection', (socket) => {
        this.handleClient(socket, bot);
      });

      this.server.on('error', (err) => {
        logger.error(`Hook server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        logger.info(`Hook server listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  private handleClient(socket: net.Socket, bot: Telegraf): void {
    let data = '';

    socket.on('data', async (chunk) => {
      data += chunk.toString();

      // Wait for complete line (newline terminated)
      if (!data.includes('\n')) {
        return;
      }

      const line = data.split('\n')[0];
      data = ''; // Clear buffer

      try {
        const request: HookRequest = JSON.parse(line);
        logger.info(`Hook request: tool=${request.tool}, id=${request.id}`);

        // Send approval request and wait for response
        const approved = await this.sendApprovalRequest(bot, request);

        // Send response
        const response: HookResponse = { approved };
        socket.write(JSON.stringify(response) + '\n');
      } catch (error: any) {
        logger.error(`Hook processing error: ${error.message}`);
        const response: HookResponse = { approved: false };
        socket.write(JSON.stringify(response) + '\n');
      } finally {
        socket.end();
      }
    });

    socket.on('error', (err) => {
      logger.error(`Socket error: ${err.message}`);
      socket.end();
    });
  }

  private async sendApprovalRequest(bot: Telegraf, request: HookRequest): Promise<boolean> {
    const approvalRequest: ApprovalRequest = {
      id: request.id,
      tool: request.tool,
      params: request.params,
      createdAt: new Date(),
    };

    const keyboard = {
      inline_keyboard: [
        [
          { text: t('hooks.permission.allowButton', this.lang), callback_data: `approve:${request.id}` },
          { text: t('hooks.permission.denyButton', this.lang), callback_data: `deny:${request.id}` },
        ],
      ],
    };

    const detail = parseToolDetail(request.tool, request.params, this.lang);
    const paramsPreview = request.params.length > 500
      ? request.params.slice(0, 500) + '...'
      : request.params;

    const title = t('hooks.permission.title', this.lang);
    const toolLabel = t('hooks.permission.tool', this.lang, { tool: request.tool });

    let text: string;
    if (detail) {
      const fullParams = t('hooks.permission.fullParams', this.lang, { params: paramsPreview });
      text = `${title}\n\n${toolLabel}\n${detail}\n\n${fullParams}`;
    } else {
      const paramsText = t('hooks.permission.params', this.lang, { params: paramsPreview });
      text = `${title}\n\n${toolLabel}\n\n${paramsText}`;
    }

    try {
      await bot.telegram.sendMessage(this.allowedUserId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error: any) {
      logger.error(`Failed to send approval request: ${error.message}`);
      this.approvalStore.complete(request.id, false);
      return false;
    }

    try {
      const approved = await this.approvalStore.register(approvalRequest, this.timeoutSec);
      logger.info(`Approval result for ${request.id}: ${approved}`);
      return approved;
    } catch (error: any) {
      logger.warn(`Approval channel error for ${request.id}: ${error.message}`);
      return false;
    }
  }
}
