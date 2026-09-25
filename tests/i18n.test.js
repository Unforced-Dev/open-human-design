import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as engine from 'natalengine';
import * as content from '../src/lib/content.js';
import * as vocabulary from '../src/lib/vocabulary.js';
import { getLocale, setLocale, resolveLocale, onLocaleChange, t, LOCALES, formatDisplay, countLabel } from '../src/lib/i18n.js';
import { localeResources } from '../src/locales/index.js';
import { formatBirth } from '../src/lib/format.js';
import { computeChart, sensitivityCheck } from '../src/lib/chartdata.js';

const directory = new URL('../src/locales/zh-CN/', import.meta.url);
const uiCatalogs = readdirSync(directory).filter(name => /^ui-.*\.json$/.test(name));

test('localized navigation keeps Timeline after Transits with stable translation keys', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const nav = html.match(/<nav class="nav">([\s\S]*?)<\/nav>/)[1];
  const items = [...nav.matchAll(/data-view="([^"]+)" data-i18n="([^"]+)"/g)]
    .map(match => [match[1], match[2]]);
  assert.deepEqual(items, [['chart', 'My Chart'], ['transits', 'Transits'],
    ['timeline', 'Timeline'], ['connection', 'Connection'], ['team', 'Team']]);
});

test('locale preference, supported browser languages and unsupported-language fallback', () => {
  assert.deepEqual(LOCALES.map(l => l.code), ['en', 'zh-CN', 'zh-Hant']);
  assert.equal(resolveLocale('zh-CN', ['en-US']), 'zh-CN');
  assert.equal(resolveLocale(null, ['en-GB', 'zh-CN']), 'en');
  assert.equal(resolveLocale(null, ['zh-Hans-CN']), 'zh-CN');
  assert.equal(resolveLocale(null, ['zh-SG']), 'zh-CN');
  assert.equal(resolveLocale('unknown', ['fr-FR']), 'en');
  for (const language of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'zh-Hant-HK']) {
    assert.equal(resolveLocale(null, [language]), 'zh-Hant');
  }
  assert.equal(resolveLocale('zh-Hant', ['zh-CN']), 'zh-Hant');
  assert.equal(resolveLocale('zh-CN', ['zh-TW']), 'zh-CN');
  assert.equal(setLocale('zh-TW', { persist: false }), false);
});

test('switch notifications, unsubscribe, source fallback and safe literal interpolation', () => {
  setLocale('en', { persist: false });
  const calls = [];
  const off = onLocaleChange(locale => calls.push(locale));
  setLocale('zh-CN', { persist: false });
  setLocale('zh-CN', { persist: false });
  assert.equal(t('Gate {gate} — {name}', { gate: 60, name: '限制' }), '第 60 闸门 · 限制');
  assert.equal(t('New upstream copy'), 'New upstream copy');
  assert.equal(t('Hello {name}', { name: '$& <XX>' }), 'Hello $& <XX>');
  off();
  setLocale('en', { persist: false });
  assert.deepEqual(calls, ['zh-CN']);
  assert.equal(getLocale(), 'en');
  assert.equal(t('Gate {gate} — {name}', { gate: 60, name: 'Limitation' }), 'Gate 60 — Limitation');
});

test('UI messages have one owner and preserve original placeholders', () => {
  const tokens = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  const seen = new Map();
  for (const file of uiCatalogs) {
    const messages = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
    for (const [source, translation] of Object.entries(messages)) {
      assert.deepEqual(tokens(translation), tokens(source), `${file}: ${source}`);
      assert.ok(translation.length, `${file}: empty translation for ${source}`);
      assert.ok(!seen.has(source), `${file}: duplicate key ${source}; already owned by ${seen.get(source)}`);
      seen.set(source, file);
    }
  }
});

test('locale providers own all language-specific display decisions', () => {
  const contract = localeResources.en;
  for (const [code, provider] of Object.entries(localeResources)) {
    assert.equal(provider.code, code);
    for (const section of ['format', 'vocabulary']) {
      assert.deepEqual(Object.keys(provider[section]).sort(), Object.keys(contract[section]).sort(), `${code}: ${section}`);
      for (const fn of Object.values(provider[section])) assert.equal(typeof fn, 'function');
    }
  }
  const files = ['main.js', 'bodygraph.js', 'lib/format.js', 'lib/content.js', 'lib/vocabulary.js',
    ...readdirSync(new URL('../src/views/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => `views/${f}`)];
  for (const file of files) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /isChinese|['"]zh-(?:CN|TW|Hans|Hant)['"]|locales\/zh-/, file);
  }
});

test('locale formatters preserve English and Chinese presentation conventions', () => {
  setLocale('en', { persist: false });
  assert.equal(formatDisplay('gateTooltip', 'Limitation', 'Limitation'), 'Limitation');
  assert.equal(formatDisplay('list', ['A','B','C']), 'A, B and C');
  assert.equal(countLabel(1, '{count} channel', '{count} channels'), '1 channel');
  assert.equal(countLabel(2, '{count} channel', '{count} channels'), '2 channels');
  assert.equal(vocabulary.graphCenter('g'), 'G');
  assert.equal(vocabulary.graphCenter('heart'), 'Ego');
  setLocale('zh-CN', { persist: false });
  assert.equal(formatDisplay('gateTooltip', '限制', '水泽节'), '限制（水泽节）');
  assert.equal(formatDisplay('list', ['甲','乙','丙']), '甲、乙、丙');
  assert.equal(formatDisplay('sensitivity', 'Moon'), '月亮闸门');
  assert.equal(countLabel(2, '{count} channel', '{count} channels'), '2 条通道');
  setLocale('en', { persist: false });
});

test('engine templates have unique sources and matching numbered placeholders', () => {
  const templates = JSON.parse(readFileSync(new URL('engine-templates.json', directory), 'utf8'));
  const seen = new Set();
  const tokens = text => [...text.matchAll(/\{\s*(\d+)\s*\}/g)].map(m => m[1]).sort();
  for (const { source, translation, omittedPluralSuffixes = [] } of templates) {
    assert.ok(!seen.has(source), source);
    seen.add(source);
    for (const index of omittedPluralSuffixes) assert.match(source, new RegExp(`(?:connection|channel)\\{${index}\\}`));
    assert.deepEqual(tokens(translation), tokens(source).filter(index => !omittedPluralSuffixes.includes(Number(index))), source);
  }
});

test('Gene Keys keywords show Chinese with original English, without added category prefixes', () => {
  setLocale('zh-CN', { persist: false });
  assert.equal(content.geneKeyTerm(4, 'shadow'), '偏狭 Intolerance');
  assert.equal(content.geneKeyTerm(4, 'gift'), '理解 Understanding');
  assert.equal(content.geneKeyTerm(4, 'siddhi'), '宽仁 Forgiveness');
  for (let gate = 1; gate <= 64; gate++) {
    for (const field of ['shadow', 'gift', 'siddhi']) {
      assert.equal(content.geneKeyTerm(gate, field), `${content.GENE_KEY_DESCRIPTIONS[gate][field]} ${engine.GENE_KEY_DESCRIPTIONS[gate][field]}`);
    }
  }
  setLocale('en', { persist: false });
  for (let gate = 1; gate <= 64; gate++) {
    for (const field of ['shadow', 'gift', 'siddhi']) assert.equal(content.geneKeyTerm(gate, field), engine.GENE_KEY_DESCRIPTIONS[gate][field]);
  }
});

test('English explanations are the upstream engine originals; Chinese covers every gate and line', () => {
  const fields = ['GATE_DESCRIPTIONS','LINE_DESCRIPTIONS','CHANNEL_DESCRIPTIONS','HEXAGRAM_DESCRIPTIONS','GENE_KEY_DESCRIPTIONS'];
  const before = JSON.stringify(fields.map(field => engine[field]));
  for (const locale of ['en', 'zh-CN', 'zh-Hant', 'en']) {
    setLocale(locale, { persist: false });
    for (const field of fields) {
      if (locale === 'en') assert.equal(JSON.stringify(content[field]), JSON.stringify(engine[field]), field);
    }
    for (let gate = 1; gate <= 64; gate++) {
      if (locale === 'en') assert.equal(vocabulary.gateName(gate), engine.GATES[gate].name);
      else assert.match(vocabulary.gateName(gate), /\p{Script=Han}/u);
      if (locale !== 'en') {
        assert.match(content.GATE_DESCRIPTIONS[gate].description, /\p{Script=Han}/u);
        assert.match(content.GENE_KEY_DESCRIPTIONS[gate].description, /\p{Script=Han}/u);
        for (let line = 1; line <= 6; line++) {
          assert.match(content.LINE_DESCRIPTIONS[gate][line].description, /\p{Script=Han}/u);
          assert.match(content.HEXAGRAM_DESCRIPTIONS[gate].lines[line], /\p{Script=Han}/u);
        }
      }
    }
  }
  assert.equal(JSON.stringify(fields.map(field => engine[field])), before);
});

test('vocabulary, date formats and calculated data remain consistent across switching', () => {
  const birth = { name: '用户 English', birthDate: '2000-05-10', birthTime: '12:30', timezone: 8 };
  setLocale('en', { persist: false });
  const data = computeChart(birth);
  const original = JSON.stringify(data);
  const sensitivity = sensitivityCheck(birth, data.chart);
  assert.equal(formatBirth(birth.birthDate, birth.birthTime), 'May 10, 2000 · 12:30 PM');
  assert.equal(vocabulary.gateName(60), 'Limitation');
  assert.equal(vocabulary.channelName([2,14]), 'The Beat');
  assert.equal(content.crossName(data.chart.incarnationCross), data.chart.incarnationCross.fullName);
  setLocale('zh-CN', { persist: false });
  assert.equal(formatBirth(birth.birthDate, birth.birthTime), '2000年5月10日 · 12:30');
  assert.equal(vocabulary.gateName(60), '限制');
  assert.equal(vocabulary.hexagramName(60), '水泽节');
  assert.equal(vocabulary.channelName([2,14]), '脉动通道');
  assert.equal(vocabulary.authorityName('Sacral Authority'), '骶骨权威');
  assert.equal(JSON.stringify(data), original);
  assert.deepEqual(sensitivityCheck(birth, data.chart), sensitivity);
  setLocale('en', { persist: false });
});
