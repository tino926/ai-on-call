import { ApprovalStore } from './approval.js';
import { AiRuntime, getRuntime } from './runtime/index.js';
import { Config } from './config.js';

export class BotState {
  workDir: string;
  sessionId?: string;
  runtimeName: string;
  readonly approvalStore: ApprovalStore;
  readonly allowedUserId: number;
  private hookUrl: string;
  
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
}
