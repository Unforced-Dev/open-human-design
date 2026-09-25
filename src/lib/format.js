import { formatDisplay } from './i18n.js';

/** Escape a string for safe interpolation into innerHTML templates. */
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Locale affects formatting only; date and time values stay unchanged. */
export const formatBirth = (date, time) => formatDisplay('birth', date, time);
