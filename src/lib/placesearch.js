/**
 * Self-contained place autocomplete — instantiable, so several can live on
 * one page (Connection's Person B, every Team member row). Resolves to
 * lat/lon + IANA timezone and computes the historical UTC offset at the birth
 * moment on demand. A small "UTC offset" fallback keeps obscure places from
 * dead-ending. No shared DOM ids.
 *
 * (entry.js predates this and keeps its own copy for the primary form; it can
 * be migrated onto this later.)
 */

import { searchPlaces, offsetForZone, formatOffset } from './location.js';
import { esc } from './format.js';
import { t, onLocaleChange } from './i18n.js';


export function createPlaceSearch(mount, { placeholder = 'Birth place', getDateTime } = {}) {
  mount.classList.add('place-search');
  mount.innerHTML = `
    <div class="ps-place">
      <input type="text" class="ps-input" placeholder="${esc(t(placeholder))}" autocomplete="off" aria-label="${esc(t(placeholder))}">
      <div class="ps-results hidden"></div>
    </div>
    <input type="number" class="ps-manual hidden" placeholder="${esc(t('UTC offset, e.g. -6'))}" min="-12" max="14" step="0.5" aria-label="${esc(t('UTC offset at birth'))}">
    <button type="button" class="ps-toggle">${t('Enter UTC offset')}</button>
    <div class="ps-chip hidden"></div>
  `;
  const place = mount.querySelector('.ps-place');
  const input = mount.querySelector('.ps-input');
  const results = mount.querySelector('.ps-results');
  const manual = mount.querySelector('.ps-manual');
  const toggle = mount.querySelector('.ps-toggle');
  const chip = mount.querySelector('.ps-chip');

  let selected = null;
  let found = [];
  let activeIndex = -1;
  let debounce = null;
  let seqCounter = 0;
  let manualMode = false;

  const dateTime = () => (getDateTime?.() || {});

  function clearResults() {
    results.innerHTML = '';
    results.classList.add('hidden');
    found = [];
    activeIndex = -1;
  }

  function updateChip() {
    if (manualMode) {
      const v = manual.value.trim();
      if (v === '') { chip.classList.add('hidden'); return; }
      chip.textContent = `${t('Manual offset')} · ${formatOffset(parseFloat(v) || 0)}`;
      chip.classList.remove('hidden');
      return;
    }
    if (!selected) { chip.classList.add('hidden'); return; }
    const { date, time } = dateTime();
    const d = date || new Date().toISOString().split('T')[0];
    const birthTime = time || '12:00';
    try {
      const off = offsetForZone(d, birthTime, selected.timezone);
      chip.textContent = `${selected.label} · ${t('{offset} at birth', { offset: formatOffset(off) })}`;
      chip.classList.remove('hidden');
    } catch {
      chip.classList.add('hidden');
    }
  }

  function pick(p) {
    selected = p;
    input.value = p.label;
    input.removeAttribute('aria-invalid');
    clearResults();
    updateChip();
  }

  function setActive(i) {
    const items = results.querySelectorAll('.ps-result');
    if (!items.length) return;
    activeIndex = ((i % items.length) + items.length) % items.length;
    items.forEach((el, j) => el.classList.toggle('active', j === activeIndex));
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => {
    selected = null;
    input.removeAttribute('aria-invalid');
    updateChip();
    const q = input.value.trim();
    clearTimeout(debounce);
    if (q.length < 2) { clearResults(); return; }
    debounce = setTimeout(async () => {
      const seq = ++seqCounter;
      try {
        const places = await searchPlaces(q);
        if (seq !== seqCounter) return; // stale response
        if (!places.length) { clearResults(); return; }
        results.innerHTML = places.map((p, i) =>
          `<button type="button" class="ps-result" data-i="${i}">${esc(p.label)}</button>`).join('');
        results.classList.remove('hidden');
        found = places;
        activeIndex = -1;
        results.querySelectorAll('.ps-result').forEach(btn =>
          btn.addEventListener('click', () => pick(places[parseInt(btn.dataset.i)])));
      } catch {
        clearResults();
      }
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    const open = !results.classList.contains('hidden') && found.length;
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIndex - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(found[activeIndex >= 0 ? activeIndex : 0]); }
    else if (e.key === 'Escape') { clearResults(); }
  });

  const onDocClick = (e) => { if (!mount.contains(e.target)) clearResults(); };
  document.addEventListener('click', onDocClick);

  manual.addEventListener('input', () => { manual.removeAttribute('aria-invalid'); updateChip(); });

  toggle.addEventListener('click', () => {
    manualMode = !manualMode;
    place.classList.toggle('hidden', manualMode);
    manual.classList.toggle('hidden', !manualMode);
    toggle.textContent = manualMode ? t('Search birth place') : t('Enter UTC offset');
    clearResults();
    updateChip();
  });

  function refreshLanguage() {
    const placeLabel = t(placeholder);
    input.placeholder = placeLabel;
    input.setAttribute('aria-label', placeLabel);
    manual.placeholder = t('UTC offset, e.g. -6');
    manual.setAttribute('aria-label', t('UTC offset at birth'));
    toggle.textContent = manualMode ? t('Search birth place') : t('Enter UTC offset');
    updateChip();
  }
  const unsubscribeLanguage = onLocaleChange(refreshLanguage);

  return {
    refreshLanguage,
    hasInput: () => manualMode ? manual.value.trim() !== '' : !!selected,
    flagMissing: () => {
      const el = manualMode ? manual : input;
      el.setAttribute('aria-invalid', 'true');
      el.focus();
    },
    /**
     * Birth-location for the given date/time, or null if nothing entered.
     * Place mode → { timezone (historical offset), lat, lon, iana, name }.
     * Manual mode → { timezone } only.
     */
    getBirthLocation(date, time) {
      if (manualMode) {
        const v = manual.value.trim();
        const parsed = parseFloat(v);
        if (v === '' || Number.isNaN(parsed)) return null;
        return { timezone: parsed };
      }
      if (!selected) return null;
      let timezone = 0;
      try { timezone = offsetForZone(date, time, selected.timezone); } catch { timezone = 0; }
      return { timezone, lat: selected.latitude, lon: selected.longitude, iana: selected.timezone, name: selected.label };
    },
    destroy() {
      document.removeEventListener('click', onDocClick);
      unsubscribeLanguage?.();
      clearTimeout(debounce);
    }
  };
}
