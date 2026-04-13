import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger.js';

const PLUGIN_DIR = path.join(process.env.HOME || '', '.opencode/plugins');
const PLUGIN_FILE = 'telegram-hook.js';
const SOURCE_PLUGIN = path.join(process.cwd(), 'scripts/opencode-plugin/telegram-hook.js');

export function ensureOpenCodePlugin(): void {
  try {
    if (!fs.existsSync(SOURCE_PLUGIN)) {
      logger.warn(`OpenCode plugin source not found: ${SOURCE_PLUGIN}`);
      return;
    }

    if (!fs.existsSync(PLUGIN_DIR)) {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
    }

    const targetPath = path.join(PLUGIN_DIR, PLUGIN_FILE);
    fs.copyFileSync(SOURCE_PLUGIN, targetPath);

    const pluginsJsonPath = path.join(PLUGIN_DIR, 'plugins.json');
    let plugins: string[] = [];

    if (fs.existsSync(pluginsJsonPath)) {
      try {
        const content = fs.readFileSync(pluginsJsonPath, 'utf-8');
        const data = JSON.parse(content);
        plugins = data.plugins || [];
      } catch {
        plugins = [];
      }
    }

    const pluginEntry = './telegram-hook.js';
    if (!plugins.includes(pluginEntry)) {
      plugins.push(pluginEntry);
      fs.writeFileSync(pluginsJsonPath, JSON.stringify({ plugins }, null, 2));
      logger.info('OpenCode plugin installed successfully');
    } else {
      logger.info('OpenCode plugin already installed');
    }
  } catch (error: any) {
    logger.error(`Failed to install OpenCode plugin: ${error.message}`);
  }
}
