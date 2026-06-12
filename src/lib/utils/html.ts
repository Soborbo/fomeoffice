// Tiny HTML escape helper for email templates. Five replacements is enough
// for attribute and text contexts. Use it on every interpolated user-
// controlled string in an HTML email body to avoid injection.

export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Email header injection prevention. Resend strips most things, but never
// trust a user-controlled subject — collapse CR/LF runs to a single space.
export function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}
