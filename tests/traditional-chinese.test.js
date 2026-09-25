import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as engine from 'natalengine';
import * as hant from '../src/locales/zh-Hant/content.js';
import * as cn from '../src/locales/zh-CN/content.js';
import * as terms from '../src/lib/vocabulary.js';
import * as content from '../src/lib/content.js';
import { setLocale, t, formatDisplay } from '../src/lib/i18n.js';
import { localeResources } from '../src/locales/index.js';

const base = new URL('../src/locales/', import.meta.url);
const read = (code, file) => JSON.parse(readFileSync(new URL(`${code}/${file}`, base), 'utf8'));
const tokens = text => [...text.matchAll(/\{\s*(\w+)\s*\}/g)].map(m => m[1]).sort();

function translated(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /\p{Script=Han}/u);
  assert.doesNotMatch(value, /\{\s*\d+\s*\}/);
  assert.doesNotMatch(value.replace(/Solar Plexus|Human Design|Richard Rudd/g, ''), /\b[A-Za-z]{3,}\s+[A-Za-z]{3,}\b/, value);
  assert.doesNotMatch(value, /骶骨|化身十字|行運|基因鑰匙|查看英文原文|箇/);
}

test('Traditional resources retain every reading, identifier, source key and placeholder', () => {
  const compare = (a, b, label) => {
    assert.equal(typeof a, typeof b, label);
    if (typeof a === 'string') {
      assert.ok(b.length, label);
      assert.deepEqual(tokens(a), tokens(b), label);
    } else if (a && typeof a === 'object') {
      assert.deepEqual(Object.keys(a), Object.keys(b), label);
      for (const key of Object.keys(a)) compare(a[key], b[key], `${label}.${key}`);
    } else assert.equal(a, b, label);
  };
  for (const file of ['gates.json', 'lines.json', 'channels.json', 'hexagrams.json', 'gene-keys.json', 'engine-messages.json', 'engine-templates.json']) {
    compare(read('zh-CN', file), read('zh-Hant', file), file);
  }
  const templates = read('zh-Hant', 'engine-templates.json');
  assert.deepEqual(templates.map(v => v.source), read('zh-CN', 'engine-templates.json').map(v => v.source));
  assert.equal(new Set(templates.map(v => v.source)).size, templates.length);
  for (const { source, translation, omittedPluralSuffixes = [] } of templates) {
    assert.deepEqual(tokens(translation), tokens(source).filter(i => !omittedPluralSuffixes.includes(Number(i))));
  }
  const seen = new Set();
  for (const file of readdirSync(new URL('zh-Hant/', base)).filter(f => /^ui-.*\.json$/.test(f))) {
    for (const [key, value] of Object.entries(read('zh-Hant', file))) {
      assert.ok(!seen.has(key), `Duplicate UI owner: ${key}`);
      seen.add(key);
      assert.deepEqual(tokens(value), tokens(key));
      assert.ok(value.length);
    }
  }
  for (const key of Object.keys(localeResources['zh-CN'].messages)) {
    assert.ok(Object.hasOwn(localeResources['zh-Hant'].messages, key), `Missing UI: ${key}`);
  }
});

test('Traditional readings cover all gates, HD lines, hexagrams, Gene Keys and channels', () => {
  for (let gate = 1; gate <= 64; gate++) {
    for (const field of ['keynote', 'description', 'quarter']) translated(hant.GATE_DESCRIPTIONS[gate][field]);
    assert.equal(hant.GATE_DESCRIPTIONS[gate].harmonic, engine.GATE_DESCRIPTIONS[gate].harmonic);
    for (let line = 1; line <= 6; line++) {
      for (const field of ['keynote', 'description']) translated(hant.LINE_DESCRIPTIONS[gate][line][field]);
      translated(hant.HEXAGRAM_DESCRIPTIONS[gate].lines[line]);
    }
    translated(hant.HEXAGRAM_DESCRIPTIONS[gate].meaning);
    for (const field of ['shadow', 'gift', 'siddhi', 'description']) translated(hant.GENE_KEY_DESCRIPTIONS[gate][field]);
  }
  assert.equal(Object.keys(hant.CHANNEL_DESCRIPTIONS).length, 36);
  for (const channel of Object.values(hant.CHANNEL_DESCRIPTIONS)) {
    for (const field of ['description', 'whenDefined', 'energyType']) translated(channel[field]);
  }
});

test('reviewed regional terminology is independent of Simplified and English', () => {
  setLocale('zh-Hant', { persist: false });
  assert.equal(terms.authorityName('Sacral Authority'), '薦骨權威');
  assert.equal(terms.profileName('1/3'), '探究者／烈士');
  assert.equal(terms.profileName('3/6'), '烈士／人生典範');
  assert.equal(terms.lineName(6), '人生典範');
  assert.equal(terms.circuitName('collective'), '社會人迴路');
  assert.equal(terms.definitionName('Split Definition'), '二分人');
  assert.equal(terms.channelName([27, 50]), '保存通道', 'preservation is not the UI action Save');
  assert.equal(t('Save'), '儲存');
  assert.equal(t('Transits'), '流日');
  assert.equal(t('Gene Keys'), '基因天命');
  assert.equal(t('Incarnation Cross'), '輪迴交叉');
  assert.equal(t('Hello {name}', { name: '用户 后台 發 財' }), 'Hello 用户 后台 發 財');
  assert.equal(formatDisplay('gateTooltip', terms.gateName(60), terms.hexagramName(60)), '限制（水澤節）');
  assert.equal(content.geneKeyTerm(4, 'siddhi'), '寬仁 Forgiveness');
  for (let gate = 1; gate <= 64; gate++) for (const field of ['shadow', 'gift', 'siddhi']) {
    assert.equal(content.geneKeyTerm(gate, field), `${hant.GENE_KEY_DESCRIPTIONS[gate][field]} ${engine.GENE_KEY_DESCRIPTIONS[gate][field]}`);
  }
  setLocale('zh-CN', { persist: false });
  assert.equal(terms.authorityName('Sacral Authority'), '骶骨权威');
  assert.equal(terms.profileName('1/3'), '研究者／实验者');
  assert.equal(content.GATE_DESCRIPTIONS[60].description, cn.GATE_DESCRIPTIONS[60].description);
  setLocale('en', { persist: false });
  assert.equal(terms.authorityName('Sacral Authority'), 'Sacral Authority');
  assert.equal(content.GATE_DESCRIPTIONS[60].description, engine.GATE_DESCRIPTIONS[60].description);
});

test('Traditional computed chart, relationship, transit and team prose preserves engine data', () => {
  const charts = Array.from({ length: 18 }, (_, i) => engine.calculateHumanDesign(`${1975+i}-0${1+i%9}-${String(1+i%27).padStart(2,'0')}`, i%24+0.5, 8));
  const original = JSON.stringify(charts);
  const check = value => translated(hant.zhText(value));
  for (const [i, chart] of charts.entries()) {
    [chart.type.description, chart.authority.description, chart.profile.theme, chart.circuitAnalysis?.dominant?.theme].filter(Boolean).forEach(check);
    for (const key of ['determination', 'environment', 'perspective', 'motivation']) check(chart.variable[key].description);
    check(chart.variable.determination.cognition.description);
    assert.match(hant.zhCross(chart.incarnationCross), /輪迴交叉/);
    const comparison = engine.compareHumanDesign(chart, charts[(i+1)%charts.length]);
    for (const key of ['dynamic', 'gifts', 'challenges', 'tips']) check(comparison.typeInteraction[key]);
    check(comparison.authorityDynamic.description);
    check(comparison.profileHarmony.description);
    check(comparison.bridging.description);
    check(comparison.summary);
    comparison.centerDynamics.forEach(v => check(v.description));
    Object.values(comparison.connectionChart.connections).flat().forEach(v => check(v.description));
    const transit = engine.calculateHDTransits(chart, '2026-09-24');
    transit.temporarilyDefinedCenters.forEach(v => check(v.theme));
    transit.reinforcedGates.forEach(v => check(v.meaning));
  }
  for (const size of [2,3,5,7]) {
    const team = engine.analyzePenta(charts.slice(0,size), Array.from({ length:size }, (_, i) => `樣例${i}`));
    team.filledRoles.forEach(v => check(v.description));
    team.missingRoles.forEach(v => check(v.suggestion));
    team.recommendations.forEach(v => check(v.insight));
    team.electromagnetics.forEach(v => check(v.theme));
  }
  assert.equal(JSON.stringify(charts), original);
});
