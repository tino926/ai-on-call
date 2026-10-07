import { t } from '../i18n.js';
import type { Language } from '../i18n.js';
import { escapeHtml } from './escape.js';

export interface ToolDetail {
  /** Localized label describing the tool type, e.g. "Bash" */
  label: string;
  /** Raw (unescaped) values to render as code spans */
  values: string[];
}

const MAX_VALUE_LEN = 300;

function truncate(value: string): string {
  return value.length > MAX_VALUE_LEN ? value.slice(0, MAX_VALUE_LEN) + '...' : value;
}

/** Wrap an arbitrary string in an HTML <code> span, escaping special characters. */
export function code(value: string): string {
  return `<code>${escapeHtml(value)}</code>`;
}

/** Render structured tool detail as an HTML fragment. */
export function renderToolDetail(detail: ToolDetail): string {
  return `${detail.label} ${detail.values.map(code).join(' ')}`;
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
          values: [truncate(raw.toString())],
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
          values: [filePath.toString()],
        };
      }
      break;
    }
    case 'NotebookEdit': {
      if (parsed.notebook_path) {
        return {
          label: t('hooks.permission.toolTypes.notebook', lang),
          values: [parsed.notebook_path.toString()],
        };
      }
      break;
    }
    case 'Read': {
      const filePath = parsed.file_path || parsed.AbsolutePath;
      if (filePath) {
        return {
          label: t('hooks.permission.toolTypes.read', lang),
          values: [filePath.toString()],
        };
      }
      break;
    }
    case 'Glob': {
      const pattern = parsed.pattern || parsed.DirectoryPath;
      if (pattern) {
        return {
          label: t('hooks.permission.toolTypes.glob', lang),
          values: [pattern.toString()],
        };
      }
      break;
    }
    case 'Grep': {
      const pattern = parsed.pattern || parsed.Query;
      if (pattern) {
        const searchPath = parsed.path || parsed.SearchPath || '.';
        return {
          label: t('hooks.permission.toolTypes.grep', lang, { path: searchPath }),
          values: [pattern.toString(), searchPath.toString()],
        };
      }
      break;
    }
  }

  return null;
}