import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../logger.js';
import { addRecord } from '../vault/records.js';
import type { DB } from '../vault/db.js';
import type { AppleCalEvent } from './types.js';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const BINARY  = join(SCRIPTS, 'cal-watch');

interface WatcherMsg {
  type: 'snapshot' | 'added' | 'modified' | 'deleted';
  events: AppleCalEvent[];
}

function findByAppleId(db: DB, appleId: string): string | null {
  const row = db.prepare(
    `SELECT id FROM records WHERE json_extract(extras, '$.apple_event_id') = ? LIMIT 1`
  ).get(appleId) as { id: string } | undefined;
  return row?.id ?? null;
}

function toExtras(e: AppleCalEvent) {
  return {
    start_at: e.start,
    end_at: e.end,
    location: e.location ?? null,
    description: e.notes ?? null,
    apple_calendar: e.calendarName,
    apple_calendar_color: e.calendarColor,
    apple_event_id: e.id,
  };
}

function syncAdded(db: DB, event: AppleCalEvent): void {
  if (findByAppleId(db, event.id)) return;
  addRecord(db, { category: 'calendar', headline: event.title, notes: event.notes ?? null, extras: toExtras(event) });
}

function syncModified(db: DB, event: AppleCalEvent): void {
  const existingId = findByAppleId(db, event.id);
  if (existingId) {
    db.prepare(`UPDATE records SET headline = ?, extras = ?, state_changed_at = ? WHERE id = ?`)
      .run(event.title, JSON.stringify(toExtras(event)), new Date().toISOString(), existingId);
  } else {
    syncAdded(db, event);
  }
}

function syncDeleted(db: DB, event: AppleCalEvent): void {
  const existingId = findByAppleId(db, event.id);
  if (existingId) {
    db.prepare(`UPDATE records SET state = 'archived', state_changed_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), existingId);
  }
}

export function startAppleCalWatcher(db: DB): void {
  if (!existsSync(BINARY)) {
    log.warn('apple-cal: binary not found — run: npm run build:swift');
    return;
  }

  const proc = spawn(BINARY, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';

  proc.stdout?.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as WatcherMsg;
        if (msg.type === 'snapshot') {
          log.info(`apple-cal: baseline — ${msg.events.length} events loaded`);
          continue;
        }
        for (const event of msg.events) {
          if (msg.type === 'added')    syncAdded(db, event);
          if (msg.type === 'modified') syncModified(db, event);
          if (msg.type === 'deleted')  syncDeleted(db, event);
          log.info(`apple-cal: ${msg.type} — "${event.title}" (${event.calendarName})`);
        }
      } catch { /* skip malformed lines */ }
    }
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    log.warn(`apple-cal: ${chunk.toString('utf8').trim()}`);
  });

  proc.on('exit', (code) => {
    log.warn(`apple-cal: watcher exited (${code ?? '?'}) — restarting in 5s`);
    setTimeout(() => startAppleCalWatcher(db), 5000);
  });
}
