import net from 'net';
import { ApprovalStore, ApprovalRequest } from './approval.js';
import { Telegraf } from 'telegraf';
import { logger } from './utils/logger.js';
import { t } from './i18n.js';
import { sendApprovalRequest } from './utils/send-approval.js';
import type { Language } from './i18n.js';

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
        const approved = await sendApprovalRequest({
          bot,
          approvalStore: this.approvalStore,
          allowedUserId: this.allowedUserId,
          lang: this.lang,
          timeoutSec: this.timeoutSec,
          request,
        });

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
}
