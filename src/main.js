/**
 * Open Human Design — entry point.
 *
 * Slim orchestrator: theme, navigation, boot sequence, people switcher.
 * The views live in src/views/, calculation in src/lib/chartdata.js,
 * persistence in src/lib/people.js (backed by natalengine profiles).
 */

import { computeChart, sensitivityCheck } from './lib/chartdata.js';
import { esc } from './lib/format.js';
import { listPeople, getPerson, savePerson, deletePerson, birthFromPerson, getLastPersonId, setLastPersonId, enableSync, setAiAccess } from './lib/people.js';
import { syncAvailable, getSessionUser, requestMagicLink, signOut, startSync } from './lib/sync.js';
import { paramsToBirth, birthToParams, shareUrl } from './lib/share.js';
import { setupEntryView } from './views/entry.js';
import { renderChartView, setupPanelTabs, rerenderBodygraph } from './views/chart.js';
import { setupTransitView, renderTransits } from './views/transits.js';
import { setupConnectionView, renderConnectionView } from './views/connection.js';
import { setupTeamView, renderTeamView } from './views/team.js';

// ==========================================
// State
// ==========================================
let currentData = null; // { birth, chart, geneKeys, sensitivity }
let entryApi = null;

// ==========================================
// Theme
// ==========================================
function initTheme() {
  const saved = localStorage.getItem('bodygraph-theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('bodygraph-theme', isDark ? 'light' : 'dark');
  // Bodygraph colors are computed at render time — refresh visible graphs
  if (currentData) {
    rerenderBodygraph();
    if (!document.getElementById('transits-view').classList.contains('hidden')) renderTransits();
  }
}

// ==========================================
// Navigation
// ==========================================
const VIEWS = ['chart', 'transits', 'connection', 'team'];

function showView(view) {
  if (!currentData && view !== 'chart') return;

  document.querySelectorAll('.nav-link').forEach(l =>
    l.classList.toggle('active', l.dataset.view === view));

  for (const v of VIEWS) {
    document.getElementById(`${v}-view`).classList.add('hidden');
  }
  document.getElementById('birth-entry').classList.toggle('hidden', !!currentData);

  if (!currentData) return;
  document.getElementById(`${view}-view`).classList.remove('hidden');

  // Per-view refresh on open
  if (view === 'transits') renderTransits();
  if (view === 'connection') renderConnectionView();
  if (view === 'team') renderTeamView();
}

function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => showView(link.dataset.view));
  });
}

// ==========================================
// People switcher (header)
// ==========================================
function renderPeopleSwitcher() {
  const select = document.getElementById('people-switcher');
  const people = listPeople();
  if (!people.length && !currentData) {
    select.classList.add('hidden');
    return;
  }
  select.classList.remove('hidden');
  const currentId = currentData?.birth?.id || '';
  const unsaved = currentData && !currentData.birth.id
    ? `<option value="__current" selected>${esc(currentData.birth.name) || 'Current chart'}</option>` : '';
  select.innerHTML = `
    ${unsaved}
    ${people.map(p => `<option value="${esc(p.id)}" ${p.id === currentId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    <option value="__new">+ New chart…</option>
    ${currentId ? '<option value="__delete">Remove this person…</option>' : ''}
  `;
}

function setupPeopleSwitcher() {
  const select = document.getElementById('people-switcher');
  select.addEventListener('change', () => {
    const value = select.value;
    if (value === '__new') {
      currentData = null;
      setLastPersonId(null);
      history.replaceState(null, '', window.location.pathname);
      document.querySelectorAll('.view-section, .chart-view').forEach(s => s.classList.add('hidden'));
      document.getElementById('birth-entry').classList.remove('hidden');
      entryApi?.renderQuickPick();
      renderPeopleSwitcher();
      return;
    }
    if (value === '__delete') {
      const id = currentData?.birth?.id;
      if (id && confirm(`Remove ${currentData.birth.name} from saved charts?`)) {
        try { deletePerson(id); } catch (e) { console.warn('Could not delete person:', e); }
        setLastPersonId(null);
        currentData = null;
        history.replaceState(null, '', window.location.pathname);
        document.querySelectorAll('.view-section, .chart-view').forEach(s => s.classList.add('hidden'));
        document.getElementById('birth-entry').classList.remove('hidden');
        entryApi?.renderQuickPick();
      }
      renderPeopleSwitcher();
      return;
    }
    if (value === '__current') return;
    const person = getPerson(value);
    if (person) loadBirth(birthFromPerson(person), { save: false });
  });
}

// ==========================================
// Chart loading
// ==========================================
function loadBirth(birth, { save = false } = {}) {
  let resolved = birth;
  if (save && birth.name) {
    // Storage can fail (private mode, quota, 50-profile cap) — the chart
    // must render regardless.
    try {
      const saved = savePerson(birth);
      resolved = { ...birth, id: saved.id };
      if (birth.aiAccess) setAiAccess(saved.id, true);
    } catch (e) {
      console.warn('Could not save person:', e);
    }
  }

  currentData = computeChart(resolved);
  currentData.sensitivity = resolved.timeUnknown ? null : sensitivityCheck(resolved, currentData.chart);

  if (resolved.id) setLastPersonId(resolved.id);
  history.replaceState(null, '', `${window.location.pathname}?${birthToParams(resolved)}`);

  renderChartView(currentData, {
    // No optional chaining — a missing clipboard API must reject so the
    // button reports failure honestly instead of "copied".
    onShare: () => navigator.clipboard.writeText(shareUrl(resolved))
  });
  renderPeopleSwitcher();
  showView('chart');
}

// ==========================================
// Sync (optional accounts)
// ==========================================
async function setupSync() {
  if (!syncAvailable) return;
  const button = document.getElementById('sync-button');
  const popover = document.getElementById('sync-popover');
  const status = document.getElementById('sync-status');
  button.classList.remove('hidden');

  // Surface magic-link failures (expired / already used) instead of
  // silently booting — better-auth redirects here with ?error=...
  const params = new URLSearchParams(window.location.search);
  const authError = params.get('error');
  if (authError) {
    params.delete('error');
    history.replaceState(null, '', `${window.location.pathname}${params.size ? '?' + params : ''}`);
  }

  const user = await getSessionUser();

  if (!user && authError) {
    popover.classList.remove('hidden');
    status.textContent = authError === 'INVALID_TOKEN'
      ? 'That sign-in link expired or was already used — request a fresh one.'
      : `Sign-in didn't complete (${authError}) — try again.`;
  }

  if (user) {
    enableSync();
    startSync({
      onRemoteChange: () => {
        renderPeopleSwitcher();
        entryApi?.renderQuickPick();
      }
    });
    button.textContent = '✓ Synced';
    button.title = `Signed in as ${user.email} — click to sign out`;
    button.addEventListener('click', async () => {
      if (confirm(`Signed in as ${user.email}. Sign out?\n\nYour charts stay on this device.`)) {
        await signOut();
        window.location.reload();
      }
    });
    return;
  }

  button.textContent = 'Sync';
  button.title = 'Sign in to sync your charts across devices';
  button.addEventListener('click', () => popover.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!popover.contains(e.target) && e.target !== button) popover.classList.add('hidden');
  });

  document.getElementById('sync-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('sync-email').value.trim();
    if (!email) return;
    status.textContent = 'Sending…';
    try {
      await requestMagicLink(email);
      status.textContent = 'Check your email for the sign-in link ✓';
    } catch {
      status.textContent = 'Could not send — sync lives at openhumandesign.com';
    }
  });
}

// ==========================================
// Boot
// ==========================================
function init() {
  initTheme();
  setupNavigation();
  setupPanelTabs();
  setupTransitView();
  setupConnectionView();
  setupTeamView();
  setupPeopleSwitcher();

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  setupSync();

  entryApi = setupEntryView({
    onSubmit: (birth, { savedPerson = false } = {}) =>
      loadBirth(birth, { save: !savedPerson && !!birth.name })
  });

  // Boot order: shared URL → last person → entry form
  // (read the deep-link view before loadBirth rewrites the URL)
  const deepLinkView = new URLSearchParams(window.location.search).get('view');
  const fromUrl = paramsToBirth(window.location.search.slice(1));
  if (fromUrl) {
    loadBirth(fromUrl, { save: false });
    if (deepLinkView && VIEWS.includes(deepLinkView)) showView(deepLinkView);
    return;
  }
  const lastId = getLastPersonId();
  if (lastId) {
    const person = getPerson(lastId);
    if (person) {
      loadBirth(birthFromPerson(person), { save: false });
      return;
    }
  }
  renderPeopleSwitcher();
}

init();
