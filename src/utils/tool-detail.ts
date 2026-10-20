import { t } from '../i18n.js';
import type { Language } from '../i18n.js';
import { escapeHtml, truncateEscaped } from './escape.js';

export interface ToolDetail {
  /** Label describing the tool type, e.g. "Bash". May be static text or raw data. */
  label: string;
  /** Raw (unescaped) values to render as code spans */
  values: string[];
}

/**
 * Maximum escaped length of a single rendered tool value. Measured after HTML
 * escaping, because entity expansion (`&` becomes 5 characters) would
 * otherwise push the message past Telegram's 4096-character limit. The extra
 * 3 characters cover the '...' marker.
 */
const MAX_VALUE_LEN = 303;

/** Wrap an arbitrary string in an HTML <code> span, escaping special characters. */
export function code(value: string): string {
  return `<code>${escapeHtml(value)}</code>`;
}

/**
 * Render structured tool detail as an HTML fragment.
 * Both the label and the values are escaped, so callers may pass raw data in
 * either field without risking HTML injection.
 */
export function renderToolDetail(detail: ToolDetail): string {
  return `${escapeHtml(detail.label)} ${detail.values.map(code).join(' ')}`;
}

/**
 * Parse tool parameters into structured detail data for approval notifications.
 * Shared across hook-server, opencode-hook-server, and approval-api-server.
 *
 * Handles both snake_case (Claude/TCP hooks) and PascalCase (agy/Gemini hooks) params.
 * Returns raw values only — escaping and <code> wrapping are the caller's job.
 */
export function parseToolDetail(tool: string, params: string, lang: Language): ToolDetail | null {
  let parsed: any;
  try {
    parsed = JSON.parse(params);
  } catch {
    return null;
  }

  switch (tool) {
    case 'Bash': {
      const raw = parsed.command || parsed.CommandLine;
      if (raw) {
        return {
          label: t('hooks.permission.toolTypes.bash', lang),
          values: [truncateEscaped(raw.toString(), MAX_VALUE_LEN)],
        };
      }
      break;
    }
    case 'Write':
    case 'Edit': {
      const filePath = parsed.file_path || parsed.TargetFile;
      if (filePath) {
        return {
          label: t('hooks.permission.toolTypes.file', lang),
          values: [truncateEscaped(filePath.toString(), MAX_VALUE_LEN)],
        };
      }
      break;
    }
    case 'NotebookEdit': {
      if (parsed.notebook_path) {
        return {
          label: t('hooks.permission.toolTypes.notebook', lang),
          values: [truncateEscaped(parsed.notebook_path.toString(), MAX_VALUE_LEN)],
        };
      }
      break;
    }
    case 'Read': {
      const filePath = parsed.file_path || parsed.AbsolutePath;
      if (filePath) {
        return {
          label: t('hooks.permission.toolTypes.read', lang),
          values: [truncateEscaped(filePath.toString(), MAX_VALUE_LEN)],
        };
      }
      break;
    }
    case 'Glob': {
      const pattern = parsed.pattern || parsed.DirectoryPath;
      if (pattern) {
        return {
          label: t('hooks.permission.toolTypes.glob', lang),
          values: [truncateEscaped(pattern.toString(), MAX_VALUE_LEN)],
        };
      }
      break;
    }
    case 'Grep': {
      const pattern = parsed.pattern || parsed.Query;
      if (pattern) {
        const searchPath = parsed.path || parsed.SearchPath || '.';
        return {
          label: t('hooks.permission.toolTypes.grep', lang),
          values: [
            truncateEscaped(pattern.toString(), MAX_VALUE_LEN),
            truncateEscaped(searchPath.toString(), MAX_VALUE_LEN),
          ],
        };
      }
      break;
    }
  }

  return null;
}
