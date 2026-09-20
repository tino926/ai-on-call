import { t } from '../i18n.js';
import type { Language } from '../i18n.js';

/**
 * Parse tool parameters into a human-readable detail string for approval notifications.
 * Shared across hook-server, opencode-hook-server, and approval-api-server.
 *
 * Handles both snake_case (Claude/TCP hooks) and PascalCase (agy/Gemini hooks) params.
 */
export function parseToolDetail(tool: string, params: string, lang: Language): string | null {
  try {
    const parsed = JSON.parse(params);

    switch (tool) {
      case 'Bash':
        if (parsed.command || parsed.CommandLine) {
          const cmd = (parsed.command || parsed.CommandLine).toString();
          const cmdPreview = cmd.length > 300 ? cmd.slice(0, 300) + '...' : cmd;
          return `${t('hooks.permission.toolTypes.bash', lang)}\`${cmdPreview}\``;
        }
        break;
      case 'Write':
      case 'Edit':
        if (parsed.file_path || parsed.TargetFile) {
          return `${t('hooks.permission.toolTypes.file', lang)}\`${parsed.file_path || parsed.TargetFile}\``;
        }
        break;
      case 'NotebookEdit':
        if (parsed.notebook_path) {
          return `${t('hooks.permission.toolTypes.notebook', lang)}\`${parsed.notebook_path}\``;
        }
        break;
      case 'Read':
        if (parsed.file_path || parsed.AbsolutePath) {
          return `${t('hooks.permission.toolTypes.read', lang)}\`${parsed.file_path || parsed.AbsolutePath}\``;
        }
        break;
      case 'Glob':
        if (parsed.pattern || parsed.DirectoryPath) {
          return `${t('hooks.permission.toolTypes.glob', lang)}\`${parsed.pattern || parsed.DirectoryPath}\``;
        }
        break;
      case 'Grep':
        if (parsed.pattern || parsed.Query) {
          const path = parsed.path || parsed.SearchPath || '.';
          const pattern = parsed.pattern || parsed.Query;
          return `${t('hooks.permission.toolTypes.grep', lang, { path })}\`${pattern}\` \`${path}\``;
        }
        break;
    }
  } catch {
    // Not JSON or parse error
  }

  return null;
}
