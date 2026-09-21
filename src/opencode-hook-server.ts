import http from 'http';
import { ApprovalStore, ApprovalRequest } from './approval.js';
import { Telegraf } from 'telegraf';
import { logger } from './utils/logger.js';
import { t } from './i18n.js';
import { parseToolDetail } from './utils/tool-detail.js';
import { sendApprovalRequest } from './utils/send-approval.js';

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

        const approved = await sendApprovalRequest({
          bot: this.bot,
          approvalStore: this.approvalStore,
          allowedUserId: this.allowedUserId,
          lang: this.lang,
          timeoutSec: this.timeoutSec,
          request,
          titlePrefix: '🔐 OpenCode',
        });

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
}
