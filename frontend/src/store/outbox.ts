import type { Op } from '../domain/ops';
import { readJson, safeStorage, writeJson, type KeyValueStorage } from './storage';

export const OUTBOX_PREFIX = 'tgb.outbox.';

/**
 * Persistent FIFO of operations that still have to reach the server. Ops are only removed
 * once the server acknowledged (or definitively rejected) them, so a lost response simply
 * leads to a replay — which the server handles idempotently.
 */
export class Outbox {
  private readonly key: string;
  private readonly storage: KeyValueStorage;
  private ops: Op[];

  constructor(matchId: string, storage: KeyValueStorage = safeStorage()) {
    this.key = `${OUTBOX_PREFIX}${matchId}`;
    this.storage = storage;
    this.ops = readJson<Op[]>(storage, this.key) ?? [];
  }

  load(): Op[] {
    return [...this.ops];
  }

  size(): number {
    return this.ops.length;
  }

  push(op: Op): void {
    this.ops.push(op);
    this.persist();
  }

  peek(limit: number): Op[] {
    return this.ops.slice(0, limit);
  }

  /** Remove acknowledged (or rejected) ops. */
  ack(opIds: string[]): void {
    if (!opIds.length) return;
    const done = new Set(opIds);
    this.ops = this.ops.filter((op) => !done.has(op.opId));
    this.persist();
  }

  clear(): void {
    this.ops = [];
    this.storage.removeItem(this.key);
  }

  private persist(): void {
    if (this.ops.length) writeJson(this.storage, this.key, this.ops);
    else this.storage.removeItem(this.key);
  }
}
