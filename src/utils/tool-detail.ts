import { t } from '../i18n.js';
import type { Language } from '../i18n.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Parse tool parameters into a human-readable detail string for approval notifications.
 * Shared across hook-server, opencode-hook-server, and approval-api-server.
 *
 * Handles both snake_case (Claude/TCP hooks) and PascalCase (agy/Gemini hooks) params.
 * Returns HTML-safe strings (uses <code> tags).
 */
export function parseToolDetail(tool: string, params: string, lang: Language): string | null {
  try {
    const parsed = JSON.parse(params);

    switch (tool) {
      case 'Bash':
        if (parsed.command || parsed.CommandLine) {
          const cmd = (parsed.command || parsed.CommandLine).toString();
          const cmdPreview = cmd.length > 300 ? cmd.slice(0, 300) + '...' : cmd;
          return `${t('hooks.permission.toolTypes.bash', lang)}<code>${escapeHtml(cmdPreview)}</code>`;
        }
        break;
      case 'Write':
      case 'Edit':
        if (parsed.file_path || parsed.TargetFile) {
          const fp = parsed.file_path || parsed.TargetFile;
          return `${t('hooks.permission.toolTypes.file', lang)}<code>${escapeHtml(fp)}</code>`;
        }
        break;
      case 'NotebookEdit':
        if (parsed.notebook_path) {
          return `${t('hooks.permission.toolTypes.notebook', lang)}<code>${escapeHtml(parsed.notebook_path)}</code>`;
        }
        break;
      case 'Read':
        if (parsed.file_path || parsed.AbsolutePath) {
          const fp = parsed.file_path || parsed.AbsolutePath;
          return `${t('hooks.permission.toolTypes.read', lang)}<code>${escapeHtml(fp)}</code>`;
        }
        break;
      case 'Glob':
        if (parsed.pattern || parsed.DirectoryPath) {
          const p = parsed.pattern || parsed.DirectoryPath;
          return `${t('hooks.permission.toolTypes.glob', lang)}<code>${escapeHtml(p)}</code>`;
        }
        break;
      case 'Grep':
        if (parsed.pattern || parsed.Query) {
          const grepPath = parsed.path || parsed.SearchPath || '.';
          const pattern = parsed.pattern || parsed.Query;
          return `${t('hooks.permission.toolTypes.grep', lang, { path: grepPath })}<code>${escapeHtml(pattern)}</code> <code>${escapeHtml(grepPath)}</code>`;
        }
        break;
    }
  } catch {
    // Not JSON or parse error
  }

  return null;
}
