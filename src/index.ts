import { config } from './config.js';
import { log } from './logger.js';
import { openDb } from './vault/db.js';
import { initVaultGit } from './vault/git.js';
import { llmHealthy } from './llm/client.js';
import { SessionManager } from './session/manager.js';
import { startServer } from './server/index.js';
import { startAppleCalWatcher } from './apple/watcher.js';

async function main(): Promise<void> {
  log.info(`local-life-os starting — vault @ ${config.vaultPath}`);
  const db = openDb();
  await initVaultGit();

  if (await llmHealthy()) {
    log.info(`model reachable @ ${config.llm.baseUrl} (${config.llm.model})`);
  } else {
    log.warn(`model NOT reachable @ ${config.llm.baseUrl} — start it with: npm run model`);
  }

  const manager = new SessionManager(db);
  startServer(manager, db);
  startAppleCalWatcher(db);
  log.info('ready. open the web UI and start capturing.');
}

main().catch((err) => {
  log.error(`fatal: ${String(err)}`);
  process.exit(1);
});
