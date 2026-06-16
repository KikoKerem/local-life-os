import { execFileSync } from 'node:child_process';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../logger.js';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');
const BINARY  = join(SCRIPTS, 'cal-write');
const SOURCE  = join(SCRIPTS, 'cal-write.swift');

export interface CreateAppleEvent {
  title: string;
  start: string;
  end?: string;
  isAllDay?: boolean;
  location?: string;
  notes?: string;
  calendarId?: string;
}

interface WriteResult { ok: boolean; eventId?: string; error?: string }

function ensureCompiled(): boolean {
  if (existsSync(BINARY)) return true;
  try {
    log.info('apple-cal: compiling writer…');
    execSync(`swiftc -swift-version 5 -O "${SOURCE}" -o "${BINARY}"`, { stdio: 'inherit' });
    return true;
  } catch (e) {
    log.warn(`apple-cal: writer compile failed — ${String(e)}`);
    return false;
  }
}

export function createAppleEvent(ev: CreateAppleEvent): WriteResult {
  if (!ensureCompiled()) return { ok: false, error: 'binary not compiled' };
  try {
    const out = execFileSync(BINARY, [], {
      input: JSON.stringify({ action: 'create', ...ev }),
      encoding: 'utf8',
      timeout: 15_000,
    });
    return JSON.parse(out.trim()) as WriteResult;
  } catch (e) {
    log.warn(`apple-cal: write failed — ${String(e)}`);
    return { ok: false, error: String(e) };
  }
}
