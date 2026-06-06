/**
 * Birth entry view — name, date, time, place autocomplete.
 *
 * The place search resolves to lat/lon + IANA timezone, and the UTC
 * offset in effect at the birth moment is computed automatically.
 * A manual UTC-offset fallback hides under "Enter UTC offset manually".
 */

import { searchPlaces, offsetForZone, formatOffset } from '../lib/location.js';
import { listPeople, birthFromPerson } from '../lib/people.js';
import { esc } from '../lib/format.js';

export function setupEntryView({ onSubmit }) {
  const form = document.getElementById('birth-form');
  const nameInput = document.getElementById('birth-name');
  const dateInput = document.getElementById('birth-date');
  const timeInput = document.getElementById('birth-time');
  const timeUnknown = document.getElementById('time-unknown');
  const placeInput = document.getElementById('birth-place');
  const placeResults = document.getElementById('place-results');
  const tzChip = document.getElementById('tz-chip');
  const manualToggle = document.getElementById('manual-tz-toggle');
  const manualWrap = document.getElementById('manual-tz-wrap');
  const manualOffset = document.getElementById('manual-tz');

  let selectedPlace = null;
  let manualMode = false;
  let searchSeq = 0;
  let debounceTimer = null;

  // --- Saved people quick-pick ---
  function renderQuickPick() {
    const wrap = document.getElementById('saved-people');
    const people = listPeople();
    if (!people.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="saved-people-label">Saved charts</div>
      <div class="saved-people-chips">
        ${people.map(p => `<button type="button" class="person-chip" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
      </div>
    `;
    wrap.querySelectorAll('.person-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const person = people.find(p => p.id === btn.dataset.id);
        if (person) onSubmit(birthFromPerson(person), { savedPerson: true });
      });
    });
  }

  // --- Place autocomplete ---
  let resultPlaces = [];
  let activeIndex = -1;

  function clearResults() {
    placeResults.innerHTML = '';
    placeResults.classList.add('hidden');
    resultPlaces = [];
    activeIndex = -1;
  }

  function selectPlace(place) {
    selectedPlace = place;
    placeInput.value = place.label;
    clearResults();
    updateTzChip();
  }

  function setActive(index) {
    const items = placeResults.querySelectorAll('.place-result');
    if (!items.length) return;
    activeIndex = ((index % items.length) + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  function updateTzChip() {
    if (manualMode) { tzChip.classList.add('hidden'); return; }
    if (!selectedPlace) { tzChip.classList.add('hidden'); return; }
    const date = dateInput.value || new Date().toISOString().split('T')[0];
    const time = timeUnknown.checked ? '12:00' : (timeInput.value || '12:00');
    try {
      const offset = offsetForZone(date, time, selectedPlace.timezone);
      tzChip.textContent = `${selectedPlace.label} · ${formatOffset(offset)} at birth · ${selectedPlace.timezone}`;
      tzChip.classList.remove('hidden');
    } catch {
      tzChip.classList.add('hidden');
    }
  }

  placeInput.addEventListener('input', () => {
    placeInput.removeAttribute('aria-invalid');
    document.getElementById('place-error')?.classList.add('hidden');
    selectedPlace = null;
    updateTzChip();
    const q = placeInput.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) { clearResults(); return; }
    debounceTimer = setTimeout(async () => {
      const seq = ++searchSeq;
      try {
        const places = await searchPlaces(q);
        if (seq !== searchSeq) return; // stale response
        if (!places.length) { clearResults(); return; }
        placeResults.innerHTML = places.map((p, i) =>
          `<button type="button" class="place-result" data-i="${i}">${esc(p.label)}</button>`
        ).join('');
        placeResults.classList.remove('hidden');
        resultPlaces = places;
        activeIndex = -1;
        placeResults.querySelectorAll('.place-result').forEach(btn => {
          btn.addEventListener('click', () => selectPlace(places[parseInt(btn.dataset.i)]));
        });
      } catch {
        clearResults();
      }
    }, 250);
  });

  // Keyboard navigation: arrows move through results; Enter commits the
  // highlighted (or first) result instead of submitting the form.
  placeInput.addEventListener('keydown', (e) => {
    const open = !placeResults.classList.contains('hidden') && resultPlaces.length;
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectPlace(resultPlaces[activeIndex >= 0 ? activeIndex : 0]);
    } else if (e.key === 'Escape') {
      clearResults();
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!placeResults.contains(e.target) && e.target !== placeInput) clearResults();
  });

  dateInput.addEventListener('change', updateTzChip);
  timeInput.addEventListener('change', updateTzChip);

  timeUnknown.addEventListener('change', () => {
    timeInput.disabled = timeUnknown.checked;
    if (timeUnknown.checked) timeInput.value = '12:00';
    updateTzChip();
  });

  manualToggle.addEventListener('click', () => {
    manualMode = !manualMode;
    manualWrap.classList.toggle('hidden', !manualMode);
    document.getElementById('place-group').classList.toggle('hidden', manualMode);
    manualToggle.textContent = manualMode ? 'Search birth place instead' : 'Enter UTC offset manually';
    updateTzChip();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const birthDate = dateInput.value;
    if (!birthDate) return;
    const birthTime = timeUnknown.checked ? '12:00' : (timeInput.value || '12:00');

    let timezone = 0;
    let location = null;
    if (manualMode) {
      // Require an explicit offset — silently defaulting to UTC produces
      // confidently wrong charts.
      const raw = manualOffset.value.trim();
      const parsed = parseFloat(raw);
      if (raw === '' || Number.isNaN(parsed)) {
        manualOffset.focus();
        manualOffset.setAttribute('aria-invalid', 'true');
        return;
      }
      manualOffset.removeAttribute('aria-invalid');
      timezone = parsed;
    } else if (selectedPlace) {
      try {
        timezone = offsetForZone(birthDate, birthTime, selectedPlace.timezone);
      } catch {
        timezone = 0;
      }
      location = {
        lat: selectedPlace.latitude,
        lon: selectedPlace.longitude,
        timezone,
        iana: selectedPlace.timezone,
        name: selectedPlace.label
      };
    } else {
      // No place selected — make the reason visible, not just a placeholder
      placeInput.focus();
      placeInput.setAttribute('aria-invalid', 'true');
      document.getElementById('place-error')?.classList.remove('hidden');
      return;
    }

    onSubmit({
      name: nameInput.value.trim() || null,
      birthDate,
      birthTime,
      timeUnknown: timeUnknown.checked,
      timezone,
      location,
      aiAccess: document.getElementById('ai-access')?.checked || false
    });
  });

  renderQuickPick();
  return { renderQuickPick };
}
