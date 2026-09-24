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
import { renderChartView, setupPanelTabs, rerenderBodygraph } from './views/chart.js';
import { setupTransitView, renderTransits } from './views/transits.js';
import { setupConnectionView, renderConnectionView, compareWithGuest, rerenderConnectionGraphs } from './views/connection.js';
import { setupTeamView, renderTeamView } from './views/team.js';

// ==========================================
// State
// ==========================================
let currentData = null; // { birth, chart, geneKeys, sensitivity }
let pendingCompare = false; // a connection invite is waiting for the visitor's own chart
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
    rerenderConnectionGraphs();
    if (!document.getElementById('transits-view').classList.contains('hidden')) renderTransits();
  }
}

// ==========================================
// Navigation
// ==========================================
const VIEWS = ['chart', 'transits', 'connection', 'team'];

function showView(view) {
  closeDetailDialog();
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
  // Never impersonate a loaded person: when nothing is loaded, show an
  // explicit placeholder instead of letting the browser display option #1.
  const placeholder = !currentData && people.length
    ? '<option value="" selected disabled>— saved charts —</option>' : '';
  select.innerHTML = `
    ${placeholder}
    ${unsaved}
    ${people.map(p => `<option value="${esc(p.id)}" ${p.id === currentId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    <option value="__new">+ New chart…</option>
    ${currentId ? '<option value="__edit">Edit name &amp; AI access…</option>' : ''}
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
    <div class="modal" role="dialog" aria-modal="true" aria-label="Edit chart">
      <div class="modal-title">Edit chart</div>
      <label class="modal-field">Name
        <input type="text" id="edit-name" value="${esc(birth.name || '')}" autocomplete="off">
      </label>
      <label class="modal-check">
        <input type="checkbox" id="edit-ai" ${getAiAccess(id) ? 'checked' : ''}>
        <span>Let my AI read this chart through the connector</span>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="edit-cancel">Cancel</button>
        <button type="button" class="btn-primary" id="edit-save">Save</button>
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
    status.textContent = authError === 'INVALID_TOKEN'
      ? 'That sign-in link expired or was already used — request a fresh one.'
      : `Sign-in didn't complete (${authError}) — try again.`;
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
    button.textContent = '✓ Synced';
    button.title = `Signed in as ${user.email}`;

    const mcpUrl = `${window.location.origin}/mcp`;
    popover.innerHTML = `
      <div class="panel-title">Account</div>
      <p class="panel-intro">Signed in as <strong>${esc(user.email)}</strong> — your saved people sync across devices.</p>

      <div class="panel-title" style="margin-top:14px">Connect your AI</div>
      <p class="panel-intro">Let Claude (or any MCP-capable AI) pull up your charts by name.</p>
      <div class="mcp-url-row">
        <code id="mcp-url">${esc(mcpUrl)}</code>
        <button id="copy-mcp" class="btn-secondary btn-small">Copy</button>
      </div>
      <ol class="mcp-steps">
        <li>In Claude: <em>Settings → Connectors → Add custom connector</em>, paste the URL</li>
        <li>Approve the connection (uses this same sign-in)</li>
        <li>Tick <em>"Let my connected AI see this person"</em> when saving people here</li>
        <li>Ask: <em>"Pull up Mom's chart"</em></li>
      </ol>
      <button id="sign-out" class="link-button" style="margin:10px 0 0">Sign out (charts stay on this device)</button>
    `;
    document.getElementById('copy-mcp').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(mcpUrl);
        e.target.textContent = 'Copied ✓';
      } catch {
        e.target.textContent = 'Copy failed';
      }
      setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
    });
    document.getElementById('sign-out').addEventListener('click', async () => {
      await signOut();
      window.location.reload();
    });
    return;
  }

  button.textContent = 'Sync';
  button.title = 'Sign in to sync your charts and connect your AI';

  document.getElementById('sync-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('sync-email').value.trim();
    if (!email) return;
    status.textContent = 'Sending…';
    try {
      await requestMagicLink(email);
      status.textContent = 'Check your email — the sign-in button works once. ✓';
    } catch {
      status.textContent = window.location.hostname.endsWith('openhumandesign.com')
        ? 'Could not send the email just now — please try again in a moment.'
        : 'Sync lives at openhumandesign.com — this copy of the app has no server.';
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
        invite.innerHTML = `<strong>${esc(fromUrl.name || 'Someone')}</strong> invited you to compare designs — enter your birth below to see your connection.`;
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
        banner.innerHTML = `Looking at <strong>${esc(fromUrl.name)}</strong>'s chart —
          <button id="make-own" class="link-button" style="display:inline;margin:0;font-size:inherit">make your own free chart →</button>`;
        banner.classList.remove('hidden');
        document.getElementById('make-own').addEventListener('click', () => {
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

init();
