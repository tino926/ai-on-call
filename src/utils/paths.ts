import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

function isLocalDev(): boolean {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.name === 'ai-on-call';
  } catch {
    return false;
  }
}

export function getConfigDir(): string {
  if (process.env.AI_ON_CALL_HOME) {
    return process.env.AI_ON_CALL_HOME;
  }
  if (isLocalDev()) {
    return process.cwd();
  }
  return path.join(os.homedir(), '.ai-on-call');
}

export const CONFIG_DIR = getConfigDir();
export const DATA_DIR = path.join(CONFIG_DIR, 'data');
export const LOG_FILE = path.join(CONFIG_DIR, 'logs', 'bot.log');
export const SCRIPTS_DIR = path.join(PACKAGE_ROOT, 'scripts');
export const LOCALES_DIR = path.join(PACKAGE_ROOT, 'locales');

export function ensureDirectories(): void {
  for (const dir of [CONFIG_DIR, DATA_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
