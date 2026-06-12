// i18n helpers — locale metadata + direction.
//
// Paraglide handles the message resolution (cookie → preferredLanguage →
// baseLocale chain). This module only adds three things on top:
//   - direction: 'ltr' | 'rtl' for the HTML dir attribute
//   - display name in the locale's own script (for the switcher button)
//   - HTML lang code (paraglide's "ar-EG" → BCP-47 stays "ar-EG")

import {
  baseLocale,
  cookieName,
  cookieMaxAge,
  locales,
  type Locale,
} from '../../paraglide/runtime.js';

export { baseLocale, cookieName, cookieMaxAge, locales };
export type { Locale };

export const RTL_LOCALES: ReadonlySet<Locale> = new Set(['ar-EG'] as Locale[]);

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function direction(locale: Locale): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

// Display labels in their native script — used for the switcher.
const NATIVE_NAMES: Record<string, string> = {
  en: 'EN',
  'ar-EG': 'العربية',
};

export function nativeName(locale: Locale): string {
  return NATIVE_NAMES[locale] ?? locale;
}

// Pick the "other" locale to switch to, given a current locale. Two-locale
// setup means this is just "the one we're not on now". Once a third locale
// is added this should return a list and the UI becomes a dropdown.
export function alternateLocale(current: Locale): Locale {
  return locales.find((l) => l !== current) ?? baseLocale;
}
