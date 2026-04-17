import http from 'http';
import { Telegraf } from 'telegraf';
import { ApprovalStore, ApprovalRequest } from './approval.js';
import { logger } from './utils/logger.js';
import { t } from './i18n.js';

type Language = 'zh-TW' | 'zh-CN' | 'en';
const DEFAULT_LANG: Language = 'zh-TW';

interface ApprovalStatus {
  approved: boolean | null;
}

export class ApprovalApiServer {
  private server: http.Server;
  private host: string;
  private port: number;
  private timeoutSec: number;
  private allowedUserId: number;
  private lang: Language = DEFAULT_LANG;
  private bot!: Telegraf;
  private completed: Map<string, boolean> = new Map();

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

    this.approvalStore.on('complete', ({ requestId, approved }) => {
      this.completed.set(requestId, approved);
    });

    this.approvalStore.on('timeout', (request) => {
      this.completed.set(request.id, false);
    });

    return new Promise((resolve, reject) => {
      this.server.on('error', (err) => {
        logger.error(`Approval API server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        logger.info(`Approval API server listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);

    if (req.method === 'POST' && url.pathname === '/api/approval/request') {
      await this.handleApprovalRequest(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/approval/')) {
      const id = url.pathname.replace('/api/approval/', '');
      await this.handleApprovalStatus(req, res, id);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private async handleApprovalRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { tool, params, session_id } = JSON.parse(body);
        
        if (!session_id) {
          throw new Error('session_id is required');
        }
        
        const id = `${session_id}-${Date.now()}`;

        const approvalRequest: ApprovalRequest = {
          id,
          tool: tool || 'unknown',
          params: params || '{}',
          createdAt: new Date(),
        };

        const keyboard = {
          inline_keyboard: [
            [
              { text: t('hooks.permission.allowButton', this.lang), callback_data: `approve:${id}` },
              { text: t('hooks.permission.denyButton', this.lang), callback_data: `deny:${id}` },
            ],
          ],
        };

        const detail = this.parseToolDetail(approvalRequest.tool, approvalRequest.params);
        const paramsPreview = approvalRequest.params.length > 500
          ? approvalRequest.params.slice(0, 500) + '...'
          : approvalRequest.params;

        const title = `🔮 Gemini ${t('hooks.permission.title', this.lang)}`;
        const toolLabel = t('hooks.permission.tool', this.lang, { tool: approvalRequest.tool });

        let text: string;
        if (detail) {
          const fullParams = t('hooks.permission.fullParams', this.lang, { params: paramsPreview });
          text = `${title}\n\n${toolLabel}\n${detail}\n\n${fullParams}`;
        } else {
          const paramsText = t('hooks.permission.params', this.lang, { params: paramsPreview });
          text = `${title}\n\n${toolLabel}\n\n${paramsText}`;
        }

        try {
          await this.bot.telegram.sendMessage(this.allowedUserId, text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          });
        } catch (error: any) {
          logger.error(`Failed to send approval request: ${error.message}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to send approval request' }));
          return;
        }

        try {
          await this.approvalStore.register(approvalRequest, this.timeoutSec);
        } catch (error: any) {
          logger.error(`Failed to register approval request: ${error.message}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to register approval request' }));
          return;
        }

        logger.info(`Approval request created: id=${id}, tool=${approvalRequest.tool}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id }));
      } catch (error: any) {
        logger.error(`Approval request error: ${error.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  private handleApprovalStatus(_req: http.IncomingMessage, res: http.ServerResponse, id: string): void {
    const status: ApprovalStatus = { approved: null };

    if (this.approvalStore.exists(id)) {
      status.approved = null;
    } else if (this.completed.has(id)) {
      status.approved = this.completed.get(id) ?? null;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
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
    }

    return null;
  }
}
