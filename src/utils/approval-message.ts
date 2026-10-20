import { t } from '../i18n.js';
import type { Language } from '../i18n.js';
import { parseToolDetail, renderToolDetail, code } from './tool-detail.js';
import { escapeHtml, truncateEscaped } from './escape.js';

/**
 * Maximum escaped length of the tool name shown in the header.
 * Tool names are short identifiers, so this only ever bites on hostile input.
 */
const MAX_TOOL_NAME_LEN = 200;

/**
 * Maximum escaped length of the raw params preview. The extra 3 characters
 * cover the '...' marker, so plain-text params keep showing the same 500
 * characters as before.
 */
const MAX_PARAMS_PREVIEW_LEN = 503;

export interface ApprovalMessageOptions {
  tool: string;
  params: string;
  lang: Language;
  titlePrefix?: string;
}

/**
 * Build the approval request message.
 *
 * Every user-controlled part is truncated by its escaped length and then
 * escaped, so the total message can never exceed Telegram's 4096-character
 * limit no matter how long or how entity-heavy the tool parameters are.
 */
export function buildApprovalMessage({
  tool,
  params,
  lang,
  titlePrefix,
}: ApprovalMessageOptions): string {
  const detail = parseToolDetail(tool, params, lang);
  const paramsPreview = truncateEscaped(params, MAX_PARAMS_PREVIEW_LEN);

  const titleBase = t('hooks.permission.title', lang);
  const title = titlePrefix ? `${titlePrefix} ${titleBase}` : titleBase;
  const toolLabel = t('hooks.permission.tool', lang, {
    tool: escapeHtml(truncateEscaped(tool, MAX_TOOL_NAME_LEN)),
  });

  if (detail) {
    const fullParams = t('hooks.permission.fullParams', lang, { params: code(paramsPreview) });
    return `${title}\n\n${toolLabel}\n${renderToolDetail(detail)}\n\n${fullParams}`;
  }

  const paramsText = t('hooks.permission.params', lang, { params: code(paramsPreview) });
  return `${title}\n\n${toolLabel}\n\n${paramsText}`;
}
