/**
 * HTML escape utility to prevent XSS/Markdown injection.
 * Escapes &, <, > characters.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const AMP_LENGTH = 5;
const TAG_OPEN_LENGTH = 4;
const TAG_CLOSE_LENGTH = 4;

function escapedCost(charCode: number): number {
  if (charCode === 0x26) return AMP_LENGTH;
  if (charCode === 0x3c) return TAG_OPEN_LENGTH;
  if (charCode === 0x3e) return TAG_CLOSE_LENGTH;
  return 1;
}

/** Length of s once HTML-escaped. */
export function escapedLength(s: string): number {
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    total += escapedCost(s.charCodeAt(i));
  }
  return total;
}

/**
 * Truncate s so that its escaped form stays within maxLength characters.
 * The trailing '...' marker counts against the budget, and the cut never
 * splits a surrogate pair.
 */
export function truncateEscaped(s: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (escapedLength(s) <= maxLength) return s;

  const budget = Math.max(0, maxLength - 3);
  let cost = 0;
  let end = 0;
  while (end < s.length) {
    const next = escapedCost(s.charCodeAt(end));
    if (cost + next > budget) break;
    cost += next;
    end++;
  }

  if (end > 0 && end < s.length) {
    const last = s.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
  }

  return s.slice(0, end) + '...';
}
