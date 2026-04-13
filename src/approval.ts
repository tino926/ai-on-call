import { EventEmitter } from 'events';

export interface ApprovalRequest {
  id: string;
  tool: string;
  params: string;
  createdAt: Date;
}

interface PendingRequest {
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
  request: ApprovalRequest;
  timeoutId: NodeJS.Timeout;
}

/**
 * Approval store for managing pending approval requests
 */
export class ApprovalStore extends EventEmitter {
  private pending: Map<string, PendingRequest>;

  constructor() {
    super();
    this.pending = new Map();
  }

  /**
   * Register a new approval request
   * @param request - The approval request
   * @param timeoutSec - Timeout in seconds
   * @returns Promise that resolves to the approval result
   */
  register(request: ApprovalRequest, timeoutSec: number = 300): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(request.id);
        this.emit('timeout', request);
        resolve(false); // Auto-deny on timeout
      }, timeoutSec * 1000);

      this.pending.set(request.id, {
        resolve,
        reject,
        request,
        timeoutId,
      });

      this.emit('request', request);
    });
  }

  /**
   * Complete an approval request
   * @param requestId - The request ID
   * @param approved - The approval result
   * @returns true if the request was found and completed
   */
  complete(requestId: string, approved: boolean): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) {
      return false;
    }

    clearTimeout(entry.timeoutId);
    this.pending.delete(requestId);
    entry.resolve(approved);
    this.emit('complete', { requestId, approved });
    return true;
  }

  /**
   * Get a pending request by ID
   */
  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.pending.get(requestId)?.request;
  }

  /**
   * Check if a request exists
   */
  exists(requestId: string): boolean {
    return this.pending.has(requestId);
  }

  /**
   * Get the number of pending requests
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clear expired requests
   * @param timeoutSec - Timeout threshold in seconds
   * @returns Array of expired requests
   */
  clearExpired(timeoutSec: number): ApprovalRequest[] {
    const now = new Date();
    const expired: ApprovalRequest[] = [];
    const threshold = timeoutSec * 1000;

    for (const [id, entry] of this.pending.entries()) {
      const age = now.getTime() - entry.request.createdAt.getTime();
      if (age > threshold) {
        expired.push(entry.request);
        clearTimeout(entry.timeoutId);
        this.pending.delete(id);
        entry.resolve(false);
      }
    }

    if (expired.length > 0) {
      this.emit('expired', expired);
    }

    return expired;
  }
}
