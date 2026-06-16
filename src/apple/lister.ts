import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../logger.js';
import type { AppleCalEvent } from './types.js';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const BINARY  = join(SCRIPTS, 'cal-watch'); // list mode via --list flag

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  calendarName: string;
  calendarColor: string;
  calendarId: string;
}

function mapEvent(e: AppleCalEvent): CalendarEvent {
  return {
    id:            e.id,
    summary:       e.title,
    start:         e.start,
    end:           e.end,
    allDay:        e.isAllDay,
    location:      e.location,
    calendarName:  e.calendarName,
    calendarColor: e.calendarColor,
    calendarId:    e.calendarId,
  };
}

const stripMs = (iso: string) => iso.replace(/\.\d{3}Z$/, 'Z');

export function listAppleEvents(from: string, to: string): CalendarEvent[] {
  if (!existsSync(BINARY)) {
    log.warn('apple-cal: binary not found — run: npm run build:swift');
    return [];
  }
  try {
    const out = execFileSync(BINARY, ['--list', '--from', stripMs(from), '--to', stripMs(to)], {
      encoding: 'utf8',
      timeout: 15_000,
    });
    const raw = JSON.parse(out.trim()) as AppleCalEvent[];
    return raw.map(mapEvent);
  } catch (e) {
    log.warn(`apple-cal: list failed — ${String(e)}`);
    return [];
  }
}
