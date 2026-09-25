import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { en, translator } from '../src/features/transit-timeline/messages.js';
import { formatDuration } from '../src/features/transit-timeline/time.js';
import { calendarRuler } from '../src/features/transit-timeline/ruler.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogs = {
  'en-GB': en,
  'zh-CN': JSON.parse(read('../src/locales/zh-CN/timeline.json')),
  'zh-Hant': JSON.parse(read('../src/locales/zh-Hant/timeline.json')),
};
const placeholders = value => [...String(value).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('both Chinese timeline catalogs match every English key and placeholder', () => {
  const keys = Object.keys(en).sort();
  for (const [locale, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(catalog).sort(), keys, `${locale} keys`);
    for (const key of keys) {
      assert.equal(typeof catalog[key], 'string', `${locale}.${key} is text`);
      assert.ok(catalog[key].trim(), `${locale}.${key} is nonempty`);
      assert.deepEqual(placeholders(catalog[key]), placeholders(en[key]), `${locale}.${key} placeholders`);
      const params = Object.fromEntries(placeholders(en[key]).map(token => [token, `VALUE_${token}`]));
      assert.doesNotMatch(translator(catalog)(key, params), /\{\w+\}/, `${locale}.${key} interpolates`);
    }
  }
  assert.notEqual(catalogs['zh-CN'].fixing_unknown, catalogs['zh-CN'].fixing_none);
  assert.notEqual(catalogs['zh-Hant'].fixing_unknown, catalogs['zh-Hant'].fixing_none);
});

test('duration messages work in all three shipped timeline languages', () => {
  const duration = ((24 + 2) * 60 + 3) * 60_000;
  const expected = {
    'en-GB': '1 day 2 hours 3 minutes',
    'zh-CN': '1 天 2 小时 3 分钟',
    'zh-Hant': '1 天 2 小時 3 分鐘',
  };
  for (const [locale, catalog] of Object.entries(catalogs)) {
    const t = translator(catalog);
    assert.equal(formatDuration(duration, t), expected[locale]);
    assert.equal(formatDuration(0, t), catalog.durationZero);
    assert.equal(formatDuration(1000, t), catalog.durationUnderMinute);
  }
});

test('the same calendar instants use each language’s ruler labels', () => {
  const range = {
    start: Date.parse('2026-09-22T16:00:00Z'),
    end: Date.parse('2026-09-25T16:00:00Z'),
  };
  const labels = {
    'en-GB': ['23/09', '24/09', '25/09'],
    'zh-CN': ['9/23', '9/24', '9/25'],
    'zh-Hant': ['9/23', '9/24', '9/25'],
  };
  for (const locale of Object.keys(catalogs)) {
    const ruler = calendarRuler(range, 'Asia/Shanghai', locale, 600);
    assert.deepEqual(ruler.cells.map(cell => cell.date), ['2026-09-23', '2026-09-24', '2026-09-25']);
    assert.deepEqual(ruler.cells.map(cell => cell.label), labels[locale]);
    assert.ok(ruler.cells.every(cell => cell.showLabel));
    assert.deepEqual(ruler.boundaries, [
      Date.parse('2026-09-23T16:00:00Z'), Date.parse('2026-09-24T16:00:00Z'),
    ]);
  }
});

test('the feature imports no application locale or translation provider', () => {
  const directory = new URL('../src/features/transit-timeline/', import.meta.url);
  for (const filename of readdirSync(directory).filter(name => name.endsWith('.js'))) {
    const source = read(`../src/features/transit-timeline/${filename}`);
    const imports = [...source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)]
      .map(match => match[1]);
    for (const specifier of imports) {
      assert.doesNotMatch(specifier, /(?:^|\/)(?:locales|i18n|vocabulary|content)(?:\/|\.|$)/,
        `${filename} must receive display resources through its host/options`);
    }
  }
});

test('setLanguage only redraws display state; it does not calculate, set form values, or bind listeners', () => {
  const source = read('../src/features/transit-timeline/view.js');
  const start = source.indexOf('  function setLanguage(');
  const end = source.indexOf('\n  return {', start);
  assert.ok(start >= 0 && end > start, 'setLanguage API exists');
  const method = source.slice(start, end);
  assert.match(method, /renderRows\(\{ sync: false \}\)/, 'render rows without resetting date/time drafts');
  assert.match(method, /graphKey = ''/, 'invalidate translated graph labels');
  assert.match(method, /host\.refreshDetail\?\.\(context\)/, 'offer shared detail redraw');
  assert.doesNotMatch(method, /\bcalculate\s*\(|\bclient\.|\bhost\.snapshot\s*\(/);
  assert.doesNotMatch(method, /\.value\s*=|\.innerHTML\s*=|\.replaceChildren\s*\(/);
  assert.doesNotMatch(method, /\b(?:addEventListener|listen)\s*\(/);
});

test('layout changes do not overwrite pending date or DST-offset drafts', () => {
  const source = read('../src/features/transit-timeline/view.js');
  const start = source.indexOf('  const sizing = new ResizeObserver(');
  const end = source.indexOf('  sizing.observe(', start);
  assert.ok(start >= 0 && end > start);
  const observer = source.slice(start, end);
  assert.match(observer, /width > 0/, 'skip a hidden ruler');
  assert.match(observer, /renderRows\(\{ sync: false \}\)/, 'resize only redraws labels and geometry');
  assert.doesNotMatch(observer, /syncClock\(|\.value\s*=/);
});
