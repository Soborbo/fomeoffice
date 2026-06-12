/**
 * Normalize a UK phone number to the local format 07xxxxxxxxx.
 * Handles: "447xxxxxxxxx", "07xxx xxxxxx", "7xxxxxxxxx", etc.
 * Returns the stripped digits unchanged if the shape is unrecognised.
 */
export function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('44')) return '0' + digits.slice(2);
  if (digits.length === 11 && digits.startsWith('07')) return digits;
  if (digits.length === 10 && digits.startsWith('7')) return '0' + digits;
  return digits;
}
