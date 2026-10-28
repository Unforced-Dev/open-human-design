/**
 * Detail panel — the one place every "what does this mean?" opens.
 *
 * Any element with data-detail="kind:id" (lib/details.js dt()/dl() write it,
 * with tabindex and role for keyboard use) inside a [data-detail-scope] opens
 * that item here, in place: a bottom sheet on narrow screens (modal, focus
 * trapped), a side panel on wide ones (non-modal, so the chart stays usable
 * beside it). Links inside the panel open onward with a Back trail.
 *
 * Views register a scope that supplies the context (which chart, which pair,
 * which team) and optional hooks to pin the matching bodygraph selection.
 * Content comes from lib/details.js (pure renderers).
 */

import { renderDetail, setLens } from './lib/details.js';

const WIDE = window.matchMedia('(min-width: 1024px)');
const scopes = {};   // name -> { renderer?: 'chart'|'pair'|'team', context(), onShow?(entry, result), onClose?() }
let panel, backdrop, bodyEl, backBtn;
let stack = [];      // [{ scope, kind, id }]
let returnFocus = null;

export function registerScope(name, hooks) {
  scopes[name] = hooks;
}

export const isOpen = () => !!panel && !panel.hidden;
const current = () => stack[stack.length - 1] || null;

function parse(attr) {
  const i = attr.indexOf(':');
  return i < 0 ? null : { kind: attr.slice(0, i), id: attr.slice(i + 1) };
}

function render({ keepScroll = false } = {}) {
  const entry = current();
  if (!entry) return close();
  const scope = scopes[entry.scope];
  const ctx = scope?.context?.();
  const result = ctx ? renderDetail(scope.renderer || entry.scope, entry.kind, entry.id, ctx) : null;
  if (!result) { stack.pop(); return stack.length ? render() : close(); }

  const scroll = bodyEl.scrollTop;
  panel.dataset.kind = entry.kind;
  bodyEl.innerHTML = `
    <div class="detail-label">${result.label}</div>
    <h2 class="detail-name" id="dp-title" tabindex="-1">${result.title}</h2>
    ${result.body}`;
  bodyEl.scrollTop = keepScroll ? scroll : 0;
  backBtn.hidden = stack.length < 2;
  scope.onShow?.(entry, result);
}

function setMode() {
  const wide = WIDE.matches;
  panel.classList.toggle('dp-side', wide);
  panel.classList.toggle('dp-sheet', !wide);
  panel.setAttribute('aria-modal', wide ? 'false' : 'true');
  backdrop.hidden = wide || !isOpen();
  document.body.classList.toggle('dp-lock', !wide && isOpen());
}

/**
 * Open kind:id from a scope. From outside the panel this starts a fresh
 * trail; from a link inside the panel it pushes onto the Back trail.
 */
export function openDetail(scope, kind, id, { push = false, trigger = null } = {}) {
  if (!panel || !scopes[scope]) return;
  const wasOpen = isOpen();
  if (!push) stack = [];
  stack.push({ scope, kind, id: String(id) });
  if (!wasOpen) returnFocus = trigger || (document.activeElement !== document.body ? document.activeElement : null);
  panel.hidden = false;
  setMode();
  render();
  if (!isOpen()) return; // nothing to show for that id
  requestAnimationFrame(() => panel.classList.add('open'));
  panel.querySelector('#dp-title')?.focus({ preventScroll: true });
}

export function closeDetail() { close(); }

function close() {
  if (!panel || panel.hidden) return;
  const entry = current() || stack[0];
  panel.classList.remove('open');
  panel.hidden = true;
  stack = [];
  setMode();
  if (entry) scopes[entry.scope]?.onClose?.();
  // Hand focus back to whatever opened the panel, if it's still on the page.
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
}

function back() {
  if (stack.length < 2) return close();
  stack.pop();
  render();
  panel.querySelector('#dp-title')?.focus({ preventScroll: true });
}

/**
 * Re-render the open item in place after its view re-rendered (theme toggle,
 * new transit date), so the panel's context and the graph pin stay current.
 */
export function refreshDetail(scope) {
  if (isOpen() && current()?.scope === scope) render({ keepScroll: true });
}

function activate(trigger, evt) {
  const target = parse(trigger.dataset.detail || '');
  if (!target) return false;
  const inPanel = panel.contains(trigger);
  const scope = inPanel ? current()?.scope : trigger.closest('[data-detail-scope]')?.dataset.detailScope;
  if (!scope || !scopes[scope]) return false;
  evt.preventDefault();
  openDetail(scope, target.kind, target.id, { push: inPanel, trigger: inPanel ? null : trigger });
  return true;
}

function trapFocus(e) {
  if (e.key !== 'Tab' || WIDE.matches || !isOpen()) return;
  const focusables = [...panel.querySelectorAll('button:not([hidden]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function initDetailPanel() {
  backdrop = document.createElement('div');
  backdrop.className = 'dp-backdrop';
  backdrop.hidden = true;
  panel = document.createElement('aside');
  panel.id = 'detail-panel';
  panel.className = 'detail-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'dp-title');
  panel.innerHTML = `
    <div class="dp-head">
      <span class="dp-handle" aria-hidden="true"></span>
      <button type="button" class="dp-back" hidden>← Back</button>
      <button type="button" class="dp-close" aria-label="Close details">&times;</button>
    </div>
    <div class="dp-body"></div>`;
  document.body.append(backdrop, panel);
  bodyEl = panel.querySelector('.dp-body');
  backBtn = panel.querySelector('.dp-back');

  backBtn.addEventListener('click', back);
  panel.querySelector('.dp-close').addEventListener('click', close);
  backdrop.addEventListener('click', close);

  panel.addEventListener('click', (e) => {
    const lensBtn = e.target.closest('[data-lens]');
    if (lensBtn) { setLens(lensBtn.dataset.lens); render({ keepScroll: true }); }
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-detail]');
    if (trigger) activate(trigger, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      // Escape belongs to an open modal dialog or a form field outside the panel first.
      const inField = e.target.closest?.('input, select, textarea') && !panel.contains(e.target);
      if (!document.querySelector('.modal-overlay') && !inField) { e.preventDefault(); close(); }
      return;
    }
    trapFocus(e);
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trigger = e.target.closest?.('[data-detail]');
    if (trigger && trigger.tagName !== 'BUTTON' && trigger.tagName !== 'A') activate(trigger, e);
  });

  WIDE.addEventListener('change', () => { if (isOpen()) setMode(); });
}
