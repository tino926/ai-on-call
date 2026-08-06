import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';

const AGY_HOOKS_FILE_NAME = 'hooks.json';
const HOOK_NAME = 'ai-on-call-approval';

function getAgyConfigDir(): string {
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.gemini', 'config');
}

function getAgyHooksFile(): string {
  return path.join(getAgyConfigDir(), AGY_HOOKS_FILE_NAME);
}

function getHookScriptPath(): string | null {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(currentDir, '..', 'scripts', 'agy-hook.ts'),
    path.join(process.cwd(), 'scripts', 'agy-hook.ts'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_\-./:=,%@+]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function buildHookCommand(scriptPath: string): string {
  const localTsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  if (fs.existsSync(localTsx)) {
    return `${shellQuote(process.execPath)} ${shellQuote(localTsx)} ${shellQuote(scriptPath)}`;
  }
  return `npx tsx ${shellQuote(scriptPath)}`;
}

export function ensureAntigravityHook(): void {
  try {
    const scriptPath = getHookScriptPath();
    if (!scriptPath) {
      logger.warn('Antigravity hook script not found (scripts/agy-hook.ts)');
      return;
    }

    const agyConfigDir = getAgyConfigDir();
    const agyHooksFile = getAgyHooksFile();

    if (!fs.existsSync(agyConfigDir)) {
      fs.mkdirSync(agyConfigDir, { recursive: true });
    }

    let hooks: Record<string, any> = {};
    if (fs.existsSync(agyHooksFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(agyHooksFile, 'utf-8'));
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          hooks = parsed;
        } else {
          logger.warn(`Ignoring invalid hooks.json (not an object): ${agyHooksFile}`);
        }
      } catch (error) {
        logger.warn(`Failed to parse existing hooks.json: ${agyHooksFile}`, { error: error instanceof Error ? error.message : String(error) });
        hooks = {};
      }
    }

    hooks[HOOK_NAME] = {
      PreToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: buildHookCommand(scriptPath),
              timeout: 300,
            },
          ],
        },
      ],
    };

    const newContent = JSON.stringify(hooks, null, 2) + '\n';

    if (fs.existsSync(agyHooksFile) && fs.readFileSync(agyHooksFile, 'utf-8') === newContent) {
      logger.info(`Antigravity hook already installed: ${agyHooksFile}`);
      return;
    }

    const tmpFile = `${agyHooksFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmpFile, newContent);
    fs.renameSync(tmpFile, agyHooksFile);
    logger.info(`Antigravity hook installed: ${agyHooksFile}`);
  } catch (error: any) {
    logger.error(`Failed to install Antigravity hook: ${error.message}`);
  }
}
