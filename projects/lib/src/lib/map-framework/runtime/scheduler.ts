import type { BatchOptions, FlushPolicy } from '../public/types';

type TaskKey = unknown;

export class FlushScheduler {
  private readonly queue = new Map<TaskKey, () => void>();
  private pendingPolicy: FlushPolicy | null = null;
  private scheduledToken = 0;
  private rafId: number | null = null;
  private batchDepth = 0;
  private readonly policyStack: FlushPolicy[] = [];

  constructor(private readonly defaultPolicy: FlushPolicy = 'microtask') {}

  batch(fn: () => void, options?: BatchOptions): void {
    if (options?.policy) {
      this.policyStack.push(options.policy);
    }
    this.batchDepth += 1;
    try {
      fn();
    } finally {
      this.batchDepth = Math.max(0, this.batchDepth - 1);
      if (options?.policy) {
        this.policyStack.pop();
      }
      if (this.batchDepth === 0 && (this.pendingPolicy !== null || this.queue.size > 0)) {
        const policy = this.pendingPolicy ?? this.currentPolicy();
        this.pendingPolicy = policy;
        this.scheduleFlush(policy);
      }
    }
  }

  schedule(key: TaskKey, task: () => void, policy?: FlushPolicy): void {
    this.queue.set(key, task);
    this.requestFlush(policy);
  }

  private requestFlush(policy?: FlushPolicy): void {
    const desired = policy ?? this.currentPolicy();
    if (this.batchDepth > 0) {
      this.pendingPolicy = this.combinePolicies(this.pendingPolicy, desired);
      return;
    }

    if (this.pendingPolicy) {
      if (this.shouldUpgradePolicy(this.pendingPolicy, desired)) {
        this.pendingPolicy = desired;
        this.scheduleFlush(desired);
      }
      return;
    }

    this.pendingPolicy = desired;
    this.scheduleFlush(desired);
  }

  private scheduleFlush(policy: FlushPolicy): void {
    const token = ++this.scheduledToken;
    if (policy === 'raf') {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = requestAnimationFrame(() => this.flush('raf', token));
      return;
    }

    queueMicrotask(() => this.flush('microtask', token));
  }

  private flush(policy: FlushPolicy, token: number): void {
    if (token !== this.scheduledToken || this.pendingPolicy !== policy) {
      return;
    }
    this.pendingPolicy = null;
    if (policy === 'raf') {
      this.rafId = null;
    }
    const tasks = Array.from(this.queue.values());
    this.queue.clear();
    tasks.forEach((task) => task());
  }

  private currentPolicy(): FlushPolicy {
    if (this.policyStack.length > 0) {
      return this.policyStack[this.policyStack.length - 1];
    }
    return this.defaultPolicy;
  }

  private combinePolicies(
    current: FlushPolicy | null,
    next: FlushPolicy,
  ): FlushPolicy | null {
    if (!current) {
      return next;
    }
    return current === 'raf' || next === 'raf' ? 'raf' : 'microtask';
  }

  private shouldUpgradePolicy(current: FlushPolicy, next: FlushPolicy): boolean {
    return current === 'microtask' && next === 'raf';
  }

  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.scheduledToken++;
    this.queue.clear();
    this.pendingPolicy = null;
  }
}
