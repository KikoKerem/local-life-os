import { randomUUID } from 'node:crypto';
import type { AppleCalEvent, PendingChange } from './types.js';

const pending = new Map<string, PendingChange>();
const changeListeners: Array<() => void> = [];

export function onQueueChange(fn: () => void): void {
  changeListeners.push(fn);
}

function notify(): void {
  for (const fn of changeListeners) fn();
}

export function enqueue(type: 'added' | 'modified' | 'deleted', event: AppleCalEvent): PendingChange {
  // If the same Apple event is already pending, replace it with the latest state
  for (const [key, item] of pending) {
    if (item.event.id === event.id) { pending.delete(key); break; }
  }
  const item: PendingChange = { changeId: randomUUID(), type, event, seenAt: new Date().toISOString() };
  pending.set(item.changeId, item);
  notify();
  return item;
}

export function list(): PendingChange[] {
  return [...pending.values()].sort((a, b) => a.seenAt.localeCompare(b.seenAt));
}

export function remove(changeId: string): boolean {
  const ok = pending.delete(changeId);
  if (ok) notify();
  return ok;
}

export function size(): number {
  return pending.size;
}
