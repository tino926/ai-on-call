import { ApprovalStore } from './approval.js';
import { AiRuntime, getRuntime } from './runtime/index.js';
import { Config } from './config.js';

/** A failed execution the user may choose to retry. */
export interface PendingRequest {
  prompt: string;
  createdAt: number;
}

/** Failed requests older than this are forgotten so the map cannot grow. */
const PENDING_REQUEST_TTL_MS = 10 * 60 * 1000;

export class BotState {
  workDir: string;
  sessionId?: string;
  runtimeName: string;
  readonly approvalStore: ApprovalStore;
  readonly allowedUserId: number;
  private hookUrl: string;

  private readonly pendingRequests = new Map<string, PendingRequest>();
  private pendingRequestSeq = 0;
  
  // Single runtime instance to preserve rate limiting state
  private runtime: AiRuntime | undefined;

  constructor(config: Config) {
    this.workDir = config.runtime.workDir;
    this.sessionId = undefined;
    this.runtimeName = config.runtime.default;
    this.approvalStore = new ApprovalStore();
    this.allowedUserId = config.bot.allowedUserId;
    this.hookUrl = `http://${config.hook.host}:${config.hook.opencodeHttpPort}`;
  }

  getRuntime(): AiRuntime {
    // Reuse existing runtime if name matches
    if (!this.runtime || this.runtime.name !== this.runtimeName) {
      this.runtime = getRuntime(this.runtimeName, this.workDir, this.hookUrl);
    }
    return this.runtime;
  }
  
  /**
   * Clear runtime cache when workDir or runtimeName changes
   */
  clearRuntimeCache(): void {
    this.runtime = undefined;
  }

  /**
   * Remember a failed prompt so a retry button can re-run it later.
   * Returns the token embedded in the callback data.
   */
  addPendingRequest(prompt: string): string {
    this.prunePendingRequests();
    const token = `${Date.now().toString(36)}${(++this.pendingRequestSeq).toString(36)}`;
    this.pendingRequests.set(token, { prompt, createdAt: Date.now() });
    return token;
  }

  /** Consume a pending request; a retry button can only fire once. */
  takePendingRequest(token: string): PendingRequest | undefined {
    const pending = this.pendingRequests.get(token);
    if (!pending) return undefined;
    this.pendingRequests.delete(token);
    return pending;
  }

  private prunePendingRequests(): void {
    const cutoff = Date.now() - PENDING_REQUEST_TTL_MS;
    for (const [token, pending] of this.pendingRequests) {
      if (pending.createdAt < cutoff) this.pendingRequests.delete(token);
    }
  }
}
