/**
 * Open Human Design — entry point.
 *
 * Slim orchestrator: theme, navigation, boot sequence, people switcher.
 * The views live in src/views/, calculation in src/lib/chartdata.js,
 * persistence in src/lib/people.js (backed by natalengine profiles).
 */

import { closeDetailDialog } from './lib/detail-dialog.js';
import { computeChart, sensitivityCheck } from './lib/chartdata.js';
import { esc } from './lib/format.js';
import { listPeople, getPerson, savePerson, deletePerson, birthFromPerson, getLastPersonId, setLastPersonId, enableSync, setAiAccess, getAiAccess, setSharedGuest } from './lib/people.js';
import { syncAvailable, getSessionUser, requestMagicLink, signOut, startSync } from './lib/sync.js';
import { paramsToBirth, birthToParams, shareUrl } from './lib/share.js';
import { setupEntryView } from './views/entry.js';
import { renderChartView, setupPanelTabs, rerenderBodygraph, refreshChartLanguage } from './views/chart.js';
import { setupTransitView, renderTransits, refreshTransitLanguage } from './views/transits.js';
import { setupConnectionView, renderConnectionView, compareWithGuest, rerenderConnectionGraphs, refreshConnectionLanguage } from './views/connection.js';
import { setupTeamView, renderTeamView, refreshTeamLanguage } from './views/team.js';
import { LOCALES, t, getLocale, setLocale, onLocaleChange, translatePage, setMessage, setHtmlMessage } from './lib/i18n.js';
import './lib/language-switcher.css';
import { setupTimelineView, timelineLanguageOptions } from './views/timeline.js';

// ==========================================
// State
// ==========================================
let currentData = null; // { birth, chart, geneKeys, sensitivity }
let pendingCompare = false; // a connection invite is waiting for the visitor's own chart
let entryApi = null;
let timelineView = null;
let initialized = false;

// Language is a display preference, independent of chart storage and accounts.
function setupLanguageSwitcher() {
  const select = document.getElementById('language-switcher');
  select.innerHTML = LOCALES.map(({ code, label }) => `<option value="${code}" lang="${code}">${label}</option>`).join('');
  select.value = getLocale();
  select.addEventListener('change', () => setLocale(select.value));
  translatePage();
  onLocaleChange(() => {
    select.value = getLocale();
    translatePage();
    if (!initialized) return;
    const chartVisible = !document.getElementById('chart-view').classList.contains('hidden');
    if (currentData) refreshChartLanguage();
    document.getElementById('chart-view').classList.toggle('hidden', !chartVisible);
    renderPeopleSwitcher();
    entryApi?.refreshLanguage();
    refreshConnectionLanguage();
    refreshTeamLanguage();
    refreshTransitLanguage();
    timelineView?.setLanguage(timelineLanguageOptions());
  });
}

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
    rerenderConnectionGraphs();
    if (!document.getElementById('transits-view').classList.contains('hidden')) renderTransits();
    timelineView?.refresh();
  }
}

// ==========================================
// Navigation
// ==========================================
const VIEWS = ['chart', 'transits', 'connection', 'team', 'timeline'];

function showView(view) {
  closeDetailDialog();
  if (view !== 'timeline') timelineView?.deactivate();
  if (!currentData && view !== 'chart') return;

  document.querySelectorAll('.nav-link').forEach(l =>
    l.classList.toggle('active', l.dataset.view === view));
  const activeLink = document.querySelector(`.nav-link[data-view="${view}"]`);
  const nav = activeLink?.parentElement;
  if (nav && nav.scrollWidth > nav.clientWidth) {
    nav.scrollLeft = activeLink.offsetLeft - nav.offsetLeft - (nav.clientWidth - activeLink.offsetWidth) / 2;
  }

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
  if (view === 'timeline') timelineView?.activate();
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
    ? `<option value="__current" selected>${esc(currentData.birth.name) || t('Current chart')}</option>` : '';
  // Never impersonate a loaded person: when nothing is loaded, show an
  // explicit placeholder instead of letting the browser display option #1.
  const placeholder = !currentData && people.length
    ? `<option value="" selected disabled>${t('— saved charts —')}</option>` : '';
  select.innerHTML = `
    ${placeholder}
    ${unsaved}
    ${people.map(p => `<option value="${esc(p.id)}" ${p.id === currentId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    <option value="__new">${t('+ New chart…')}</option>
    ${currentId ? `<option value="__edit">${esc(t('Edit name & AI access…'))}</option>` : ''}
    ${currentId ? `<option value="__delete">${t('Remove this person…')}</option>` : ''}
  `;
}

function setupPeopleSwitcher() {
  const select = document.getElementById('people-switcher');
  select.addEventListener('change', () => {
    const value = select.value;
    if (value === '__new') {
      timelineView?.deactivate();
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
      if (id && confirm(t('Remove {name} from saved charts?', { name: currentData.birth.name }))) {
        timelineView?.deactivate();
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
    if (value === '__edit') {
      if (currentData?.birth?.id) openEditPerson(currentData.birth);
      renderPeopleSwitcher(); // reset the select back to the loaded person
      return;
    }
    if (value === '__current') return;
    const person = getPerson(value);
    if (person) loadBirth(birthFromPerson(person), { save: false });
  });
}

// Edit a saved person — rename (re-save under the same id) and toggle whether
// the AI connector may read this chart. (P1-7: backend existed, no UI did.)
function openEditPerson(birth) {
  const id = birth.id;
  if (!id) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${t('Edit chart')}" data-i18n-aria-label="Edit chart">
      <div class="modal-title" data-i18n="Edit chart">${t('Edit chart')}</div>
      <label class="modal-field"><span data-i18n="Name">${t('Name')}</span>
        <input type="text" id="edit-name" value="${esc(birth.name || '')}" autocomplete="off">
      </label>
      <label class="modal-check">
        <input type="checkbox" id="edit-ai" ${getAiAccess(id) ? 'checked' : ''}>
        <span data-i18n="Let my AI read this chart through the connector">${t('Let my AI read this chart through the connector')}</span>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="edit-cancel" data-i18n="Cancel">${t('Cancel')}</button>
        <button type="button" class="btn-primary" id="edit-save" data-i18n="Save">${t('Save')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const nameInput = overlay.querySelector('#edit-name');
  nameInput.focus();
  nameInput.select();

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#edit-cancel').addEventListener('click', close);
  overlay.querySelector('#edit-save').addEventListener('click', () => {
    const newName = nameInput.value.trim() || birth.name;
    const aiOn = overlay.querySelector('#edit-ai').checked;
    try {
      savePerson({ ...birth, name: newName }); // same id → rename in place
      setAiAccess(id, aiOn);
    } catch (e) { console.warn('Could not update person:', e); }
    close();
    if (currentData?.birth?.id === id) loadBirth({ ...birth, name: newName }, { save: false });
    else renderPeopleSwitcher();
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
    setMessage(status, authError === 'INVALID_TOKEN'
      ? 'That sign-in link expired or was already used — request a fresh one.'
      : "Sign-in didn't complete ({error}) — try again.", { error: authError });
  }

  button.addEventListener('click', () => popover.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!popover.contains(e.target) && e.target !== button) popover.classList.add('hidden');
  });

  if (user) {
    // The AI-access checkbox only means something once an account exists
    document.getElementById('ai-access-wrap')?.classList.remove('hidden');
    enableSync();
    startSync({
      onRemoteChange: () => {
        renderPeopleSwitcher();
        entryApi?.renderQuickPick();
      }
    });
    setMessage(button, '✓ Synced');
    const refreshTitle = () => { button.title = t('Signed in as {email}', { email: user.email }); };
    refreshTitle(); onLocaleChange(refreshTitle);

    const mcpUrl = `${window.location.origin}/mcp`;
    popover.innerHTML = `
      <div class="panel-title" data-i18n="Account">${t('Account')}</div>
      <p class="panel-intro" id="sync-account-intro"></p>

      <div class="panel-title" style="margin-top:14px" data-i18n="Connect your AI">${t('Connect your AI')}</div>
      <p class="panel-intro" data-i18n="Let Claude (or any MCP-capable AI) pull up your charts by name.">${t('Let Claude (or any MCP-capable AI) pull up your charts by name.')}</p>
      <div class="mcp-url-row">
        <code id="mcp-url">${esc(mcpUrl)}</code>
        <button id="copy-mcp" class="btn-secondary btn-small" data-i18n="Copy">${t('Copy')}</button>
      </div>
      <ol class="mcp-steps">
        <li data-i18n-html="In Claude: <em>Settings → Connectors → Add custom connector</em>, paste the URL"></li>
        <li data-i18n="Approve the connection (uses this same sign-in)"></li>
        <li data-i18n-html="Tick <em>&quot;Let my connected AI see this person&quot;</em> when saving people here"></li>
        <li data-i18n-html="Ask: <em>&quot;Pull up Mom's chart&quot;</em>"></li>
      </ol>
      <button id="sign-out" class="link-button" style="margin:10px 0 0" data-i18n="Sign out (charts stay on this device)"></button>
    `;
    setHtmlMessage(document.getElementById('sync-account-intro'), 'Signed in as <strong>{email}</strong> — your saved people sync across devices.', { email: esc(user.email) });
    translatePage(popover);
    document.getElementById('copy-mcp').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(mcpUrl);
        setMessage(e.target, 'Copied ✓');
      } catch {
        setMessage(e.target, 'Copy failed');
      }
      setTimeout(() => { setMessage(e.target, 'Copy'); }, 2000);
    });
    document.getElementById('sign-out').addEventListener('click', async () => {
      await signOut();
      window.location.reload();
    });
    return;
  }

  setMessage(button, 'Sync');
  button.dataset.i18nTitle = 'Sign in to sync your charts and connect your AI';
  button.title = t(button.dataset.i18nTitle);

  document.getElementById('sync-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('sync-email').value.trim();
    if (!email) return;
    setMessage(status, 'Sending…');
    try {
      await requestMagicLink(email);
      setMessage(status, 'Check your email — the sign-in button works once. ✓');
    } catch {
      setMessage(status, window.location.hostname.endsWith('openhumandesign.com')
        ? 'Could not send the email just now — please try again in a moment.'
        : 'Sync lives at openhumandesign.com — this copy of the app has no server.');
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
  timelineView = setupTimelineView();
  setupPeopleSwitcher();

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  setupSync();

  entryApi = setupEntryView({
    onSubmit: (birth, { savedPerson = false } = {}) => {
      loadBirth(birth, { save: !savedPerson && !!birth.name });
      if (pendingCompare) {
        pendingCompare = false;
        document.getElementById('entry-invite')?.classList.add('hidden');
        showView('connection');
        compareWithGuest();
      }
    }
  });
  initialized = true;

  // Boot order: connection invite → shared URL → last person → entry form
  // (read the deep-link view before loadBirth rewrites the URL)
  const deepLinkView = new URLSearchParams(window.location.search).get('view');
  const connectInvite = new URLSearchParams(window.location.search).get('connect') === '1';
  const fromUrl = paramsToBirth(window.location.search.slice(1));

  if (fromUrl && connectInvite) {
    // "Compare designs with me" invite: the sender is the OTHER person.
    setSharedGuest(fromUrl);
    history.replaceState(null, '', window.location.pathname); // don't re-trigger on reload
    const lastId = getLastPersonId();
    const me = lastId && getPerson(lastId);
    if (me) {
      loadBirth(birthFromPerson(me), { save: false }); // returning visitor → straight to the compare
      showView('connection');
      compareWithGuest();
    } else {
      pendingCompare = true; // new visitor enters their chart first, then we compare
      const invite = document.getElementById('entry-invite');
      if (invite) {
        setHtmlMessage(invite, '<strong>{name}</strong> invited you to compare designs — enter your birth below to see your connection.', { name: esc(fromUrl.name || t('Someone')) });
        invite.classList.remove('hidden');
      }
      document.getElementById('birth-entry')?.classList.remove('hidden');
      renderPeopleSwitcher();
    }
    return;
  }

  if (fromUrl) {
    loadBirth(fromUrl, { save: false });
    if (deepLinkView && VIEWS.includes(deepLinkView)) showView(deepLinkView);
    // Shared-chart landing: someone opened a link to a chart that isn't
    // theirs — invite them to make their own (the viral loop).
    if (!getLastPersonId() && fromUrl.name) {
      setSharedGuest(fromUrl); // keep them available to compare after "make your own"
      const banner = document.getElementById('shared-cta');
      if (banner) {
        banner.innerHTML = `<span id="shared-person-intro"></span>
          <button id="make-own" class="link-button" style="display:inline;margin:0;font-size:inherit" data-i18n="make your own free chart →">${t('make your own free chart →')}</button>`;
        setHtmlMessage(document.getElementById('shared-person-intro'), "Looking at <strong>{name}</strong>'s chart —", { name: esc(fromUrl.name) });
        banner.classList.remove('hidden');
        document.getElementById('make-own').addEventListener('click', () => {
          timelineView?.deactivate();
          currentData = null;
          history.replaceState(null, '', window.location.pathname);
          banner.classList.add('hidden');
          document.querySelectorAll('.view-section, .chart-view').forEach(s => s.classList.add('hidden'));
          document.getElementById('birth-entry').classList.remove('hidden');
          renderPeopleSwitcher();
        });
      }
    }
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

setupLanguageSwitcher();
init();
