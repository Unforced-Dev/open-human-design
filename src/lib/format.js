/** Escape a string for safe interpolation into innerHTML templates. */
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "1990-06-15" + "14:30" → "June 15, 1990 · 2:30 PM" */
export function formatBirth(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  let out = `${months[m - 1]} ${d}, ${y}`;
  if (timeStr) {
    const [h, min] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out += ` · ${h12}:${String(min).padStart(2, '0')} ${ampm}`;
  }
  return out;
}
