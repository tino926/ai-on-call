import { escapeHtml, escapedCost, escapedLength } from './escape.js';

/** Telegram rejects messages longer than this (UTF-16 code units). */
const TELEGRAM_MAX_LENGTH = 4096;

const PRE_OPEN = '<pre>';
const PRE_CLOSE = '</pre>';

/** Worst-case page marker: "\n\n(999/999)". */
const PAGE_MARKER_RESERVE = 12;

/**
 * Payload budget per chunk, measured in escaped characters.
 *
 * Telegram measures the decoded text, so an HTML entity costs one character
 * there and up to five here. Budgeting the escaped form is therefore
 * conservative: a chunk that fits here always fits there, while the opposite
 * mistake is a silent 400. Tags are reserved on top because they count towards
 * the same limit.
 */
const MAX_ESCAPED_PAYLOAD = TELEGRAM_MAX_LENGTH - PRE_OPEN.length - PRE_CLOSE.length;

const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

/**
 * Minimum fraction of the budget a chunk must use before a newline or space
 * break is accepted. Without it, a lone early newline followed by a long
 * unbroken run produces a near-empty chunk instead of a full one.
 */
const MIN_CHUNK_FILL = 0.5;

function wrap(payload: string, marker: string): string {
  return `${PRE_OPEN}${escapeHtml(payload)}${marker}${PRE_CLOSE}`;
}

/**
 * Largest exclusive cut point whose escaped payload fits the budget.
 * A chunk never ends between the halves of a surrogate pair.
 */
function hardLimit(text: string, start: number, budget: number): number {
  let cost = 0;
  let end = start;

  while (end < text.length) {
    const next = escapedCost(text.charCodeAt(end));
    if (cost + next > budget) break;
    cost += next;
    end++;
  }

  if (end > start && end < text.length) {
    const last = text.charCodeAt(end - 1);
    if (last >= HIGH_SURROGATE_MIN && last <= HIGH_SURROGATE_MAX) end--;
  }

  return end;
}

/**
 * Split text into Telegram-safe HTML chunks.
 *
 * Each returned chunk is already escaped and wrapped in <pre>, and stays under
 * Telegram's 4096-character limit, so callers only need
 * `parse_mode: 'HTML'`. Split points prefer a newline, then a space, then a
 * hard cut; the separator stays at the end of the earlier chunk, so joining the
 * payloads reproduces the input exactly.
 */
export function splitMessage(text: string): string[] {
  if (text.length === 0) {
    return [''];
  }

  if (escapedLength(text) <= MAX_ESCAPED_PAYLOAD) {
    return [wrap(text, '')];
  }

  const budget = MAX_ESCAPED_PAYLOAD - PAGE_MARKER_RESERVE;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = hardLimit(text, start, budget);

    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }

    if (end <= start) end = start + 1;

    const minFill = start + Math.floor(budget * MIN_CHUNK_FILL);

    const newlinePos = text.lastIndexOf('\n', end);
    if (newlinePos >= minFill) {
      chunks.push(text.slice(start, newlinePos + 1));
      start = newlinePos + 1;
      continue;
    }

    const spacePos = text.lastIndexOf(' ', end);
    if (spacePos >= minFill) {
      chunks.push(text.slice(start, spacePos + 1));
      start = spacePos + 1;
      continue;
    }

    chunks.push(text.slice(start, end));
    start = end;
  }

  const total = chunks.length;
  return chunks.map((chunk, i) => wrap(chunk, `\n\n(${i + 1}/${total})`));
}
