/**
 * HTML escape utility to prevent XSS/Markdown injection.
 * Escapes &, <, > characters.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>');
}