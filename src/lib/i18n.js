/** Locale state and source-keyed UI messages. English is the upstream fallback. */
import { localeResources } from '../locales/index.js';
export const LOCALES = Object.freeze(Object.values(localeResources).map(({code,label}) => ({code,label})));
export const LOCALE_STORAGE_KEY = 'ohd-language';
const catalogs = new Map(Object.entries(localeResources).map(([code, resources]) => [code, resources.messages]));
const listeners = new Set();
const messageParams = new WeakMap();

export function resolveLocale(saved, languages = []) {
  if (LOCALES.some(item => item.code === saved)) return saved;
  for (const language of languages) {
    const match = Object.values(localeResources).find(resources => resources.matches(language));
    if (match) return match.code;
  }
  return 'en';
}

let initialPreference;
try { if (typeof window !== 'undefined') initialPreference = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY); } catch { /* Private storage may be disabled. */ }
let locale = resolveLocale(initialPreference, globalThis.navigator?.languages || []);
export const getLocale = () => locale;
export const getLocaleResources = () => localeResources[locale] || localeResources.en;
export const formatDisplay = (kind, ...args) => (getLocaleResources().format[kind] || localeResources.en.format[kind])(...args);
export const countLabel = (count, singular, plural) => t(count === 1 ? singular : plural, { count });

export function setLocale(next, { persist = true } = {}) {
  if (!LOCALES.some(item => item.code === next)) return false;
  if (persist) {
    try { if (typeof window !== 'undefined') globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, next); } catch { /* Switching still works without storage. */ }
  }
  if (locale === next) return true;
  locale = next;
  for (const listener of listeners) listener(locale);
  return true;
}

export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerMessages(code, messages) {
  catalogs.set(code, { ...catalogs.get(code), ...messages });
}

export function t(source, params = {}) {
  const template = catalogs.get(locale)?.[source] ?? catalogs.get('en')?.[source] ?? source;
  return String(template).replace(/\{(\w+)\}/g, (token, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : token);
}

export function setMessage(node, source, params = {}) {
  if (!node) return;
  node.dataset.i18n = source;
  messageParams.set(node, params);
  node.textContent = t(source, params);
}

/** For trusted, application-owned markup only; callers must escape user values. */
export function setHtmlMessage(node, source, params = {}) {
  if (!node) return;
  node.dataset.i18nHtml = source;
  messageParams.set(node, params);
  node.innerHTML = t(source, params);
}

/** Only explicitly marked UI nodes are translated; user text is never scanned. */
export function translatePage(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(node => {
    node.textContent = t(node.dataset.i18n, messageParams.get(node));
  });
  root.querySelectorAll('[data-i18n-html]').forEach(node => {
    node.innerHTML = t(node.dataset.i18nHtml, messageParams.get(node));
  });
  for (const attribute of ['title', 'placeholder', 'aria-label', 'content']) {
    root.querySelectorAll(`[data-i18n-${attribute}]`).forEach(node => {
      node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`)));
    });
  }
  if (root === document) document.documentElement.lang = locale;
}
