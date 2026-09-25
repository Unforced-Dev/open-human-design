// One active graph detail sheet across views, with consistent dismissal and
// keyboard focus. Reopening the same sheet preserves its original trigger.
import { t } from './i18n.js';

let active = null;

export function closeDetailDialog() {
  if (!active) return;
  const { element, cleanup, onClose, trigger } = active;
  active = null;
  element.classList.add('hidden');
  document.body.classList.remove('modal-open');
  cleanup();
  onClose?.();
  if (trigger?.isConnected) trigger.focus({ preventScroll: true });
}

export function openDetailDialog(element, onClose) {
  if (active?.element !== element) {
    closeDetailDialog();
    const trigger = document.activeElement;
    const onBackdrop = e => { if (e.target === element) closeDetailDialog(); };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); closeDetailDialog(); }
      if (e.key !== 'Tab') return;
      const buttons = [...element.querySelectorAll('button, [tabindex="0"]')];
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first?.focus();
      }
    };
    element.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    active = { element, trigger, onClose, cleanup() {
      element.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
    } };
  }
  element.classList.remove('hidden');
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', t('Bodygraph details'));
  document.body.classList.add('modal-open');
  element.querySelector('.gate-detail-close')?.addEventListener('click', closeDetailDialog);
  element.querySelector('.gate-detail-close')?.focus({ preventScroll: true });
}
