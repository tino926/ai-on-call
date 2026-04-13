import http from 'http';
import { ApprovalStore, ApprovalRequest } from './approval.js';
import { Telegraf } from 'telegraf';
import { logger } from './utils/logger.js';
import { t } from './i18n.js';

type Language = 'zh-TW' | 'zh-CN' | 'en';
const DEFAULT_LANG: Language = 'zh-TW';

interface HookRequest {
  id: string;
  tool: string;
  params: string;
}

interface HookResponse {
  approved: boolean;
}

export class OpenCodeHookServer {
  private server: http.Server;
  private host: string;
  private port: number;
  private timeoutSec: number;
  private allowedUserId: number;
  private lang: Language = DEFAULT_LANG;
  private bot!: Telegraf;

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
    
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  getServer(): http.Server {
    return this.server;
  }

  setLanguage(lang: Language): void {
    this.lang = lang;
  }

  start(bot: Telegraf): Promise<void> {
    this.bot = bot;
    
    return new Promise((resolve, reject) => {
      this.server.on('error', (err) => {
        logger.error(`OpenCode hook server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        logger.info(`OpenCode hook server listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (req.method !== 'POST' || req.url !== '/hook/opencode') {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const request: HookRequest = JSON.parse(body);
        logger.info(`OpenCode hook request: tool=${request.tool}, id=${request.id}`);

        const approved = await this.sendApprovalRequest(this.bot, request);

        const response: HookResponse = { approved };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error: any) {
        logger.error(`OpenCode hook processing error: ${error.message}`);
        const response: HookResponse = { approved: false };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      }
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

    const detail = this.parseToolDetail(request.tool, request.params);
    const paramsPreview = request.params.length > 500
      ? request.params.slice(0, 500) + '...'
      : request.params;

    const title = `🔐 OpenCode ${t('hooks.permission.title', this.lang)}`;
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

  private parseToolDetail(tool: string, params: string): string | null {
    try {
      const parsed = JSON.parse(params);
      
      switch (tool) {
        case 'Bash':
          if (parsed.command) {
            const cmd = parsed.command.length > 300 
              ? parsed.command.slice(0, 300) + '...' 
              : parsed.command;
            return `${t('hooks.permission.toolTypes.bash', this.lang)}\`${cmd}\``;
          }
          break;
        case 'Write':
        case 'Edit':
          if (parsed.file_path) {
            return `${t('hooks.permission.toolTypes.file', this.lang)}\`${parsed.file_path}\``;
          }
          break;
        case 'Read':
          if (parsed.file_path) {
            return `${t('hooks.permission.toolTypes.read', this.lang)}\`${parsed.file_path}\``;
          }
          break;
        case 'Glob':
          if (parsed.pattern) {
            return `${t('hooks.permission.toolTypes.glob', this.lang)}\`${parsed.pattern}\``;
          }
          break;
        case 'Grep':
          if (parsed.pattern) {
            const path = parsed.path || '.';
            return `${t('hooks.permission.toolTypes.grep', this.lang, { path })}\`${parsed.pattern}\` \`${path}\``;
          }
          break;
      }
    } catch (e) {
      // Not JSON or parse error
    }
    
    return null;
  }
}
