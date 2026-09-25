import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from 'natalengine';
import * as zh from '../src/locales/zh-CN/content.js';
import { HEXAGRAM_ZH, zhGate, zhCenter, zhChannel } from '../src/locales/zh-CN/vocabulary.js';

function chinese(value, label) {
  assert.equal(typeof value, 'string', label);
  assert.match(value, /[\u3400-\u9fff]/u, label);
  assert.doesNotMatch(value, /(?:查看英文原文|避免误造中文|缺乏统一授权|原文保留|荐骨|骸骨)/, label);
  assert.doesNotMatch(value, /\{\s*\d+\s*\}/, label);
  // Proper names and the engine's person markers are allowed; untranslated prose is not.
  assert.doesNotMatch(value.replace(/Solar Plexus|Human Design|Richard Rudd/g,''), /\b[A-Za-z]{3,}\s+[A-Za-z]{3,}\b/, label + ': ' + value);
}

test('complete Chinese readings: 64 gates, 384 HD lines, 384 I Ching lines, 64 Gene Keys and 36 channels', () => {
  for (let gate = 1; gate <= 64; gate++) {
    for (const field of ['keynote', 'description', 'quarter']) chinese(zh.GATE_DESCRIPTIONS[gate][field], `gate ${gate} ${field}`);
    assert.equal(zh.GATE_DESCRIPTIONS[gate].harmonic, engine.GATE_DESCRIPTIONS[gate].harmonic);
    for (let line = 1; line <= 6; line++) {
      for (const field of ['keynote', 'description']) chinese(zh.LINE_DESCRIPTIONS[gate][line][field], `HD ${gate}.${line} ${field}`);
      chinese(zh.HEXAGRAM_DESCRIPTIONS[gate].lines[line], `I Ching ${gate}.${line}`);
    }
    chinese(zh.HEXAGRAM_DESCRIPTIONS[gate].meaning, `I Ching ${gate}`);
    for (const field of ['shadow', 'gift', 'siddhi', 'description']) chinese(zh.GENE_KEY_DESCRIPTIONS[gate][field], `Gene Key ${gate} ${field}`);
    chinese(HEXAGRAM_ZH[gate], `hexagram name ${gate}`);
    assert.ok(!HEXAGRAM_ZH[gate].includes('／'));
  }
  assert.equal(Object.keys(zh.CHANNEL_DESCRIPTIONS).length, 36);
  for (const [key, channel] of Object.entries(zh.CHANNEL_DESCRIPTIONS)) {
    for (const field of ['description', 'whenDefined', 'energyType']) chinese(channel[field], `channel ${key} ${field}`);
  }
});

test('source prose is preserved in the engine; localization affects display copies only', () => {
  assert.match(engine.GATE_DESCRIPTIONS[28].description, /purpose and meaning through struggle/);
  assert.equal(engine.GATES[28].name, 'The Player');
  assert.equal(zhGate(28), '玩家');
  assert.equal(HEXAGRAM_ZH[28], '泽风大过');
  assert.equal(engine.GATES[60].name, 'Limitation');
  assert.equal(zhGate(60), '限制');
  assert.equal(HEXAGRAM_ZH[60], '水泽节');
  assert.deepEqual(
    ['shadow', 'gift', 'siddhi'].map(field => zh.GENE_KEY_DESCRIPTIONS[60][field]),
    ['限制', '现实', '公义']
  );
  assert.equal(engine.GENE_KEY_DESCRIPTIONS[61].shadow, 'Psychosis');
  assert.equal(zh.GENE_KEY_DESCRIPTIONS[61].shadow, '神经失常');
  assert.equal(zh.zhText('Innocence'), '纯真');
  assert.equal(zh.HEXAGRAM_DESCRIPTIONS[25].name, '天雷无妄');
  assert.equal(zh.zhText('moon'), '月亮');
  assert.equal(zh.zhText('Sacral Authority'), '骶骨权威');
  assert.equal(zh.zhText('The Plane'), '物质界');
  assert.equal(zhChannel([2,14]), '脉动通道');
  assert.equal(zh.zhText('The Beat'), '脉动');
  assert.match(zh.CHANNEL_DESCRIPTIONS['2-14'].description, /^脉动通道/);
  for (const [key,c] of Object.entries(engine.CENTERS)) assert.equal(zh.zhText(c.name), zhCenter(key));
});

test('computed charts, relationships, teams and transits have translated dynamic display prose', () => {
  const charts = Array.from({ length: 18 }, (_,i) => engine.calculateHumanDesign(`${1975+i}-0${1+i%9}-${String(1+i%27).padStart(2,'0')}`, i%24+0.5, 8));
  const originals = JSON.stringify(charts);
  const check = (v,label) => chinese(zh.zhText(v),label);
  for (const [i,c] of charts.entries()) {
    [c.type.description,c.authority.description,c.profile.theme,c.circuitAnalysis?.dominant?.theme].filter(Boolean).forEach(v=>check(v,'foundation'));
    for (const key of ['determination','environment','perspective','motivation']) check(c.variable[key].description,`variable ${key}`);
    check(c.variable.determination.cognition.description,'cognition');
    chinese(zh.zhCross(c.incarnationCross),'incarnation cross');
    const comp = engine.compareHumanDesign(c, charts[(i+1)%charts.length]);
    for (const key of ['dynamic','gifts','challenges','tips']) check(comp.typeInteraction[key],`type ${key}`);
    check(comp.authorityDynamic.description,'authority');
    check(comp.profileHarmony.description,'profile');
    check(comp.bridging.description,'bridging');
    check(comp.summary,'summary');
    comp.centerDynamics.forEach(v=>check(v.description,'center dynamic'));
    Object.values(comp.connectionChart.connections).flat().forEach(v=>check(v.description,'channel dynamic'));
    const transit = engine.calculateHDTransits(c,'2026-09-24');
    transit.temporarilyDefinedCenters.forEach(v=>check(v.theme,'transit center'));
    transit.reinforcedGates.forEach(v=>{
      check(v.meaning,'reinforced gate');
      assert.doesNotMatch(zh.zhText(v.meaning),/\b(sun|moon|earth|mars|venus|mercury|jupiter|saturn|uranus|neptune|pluto)\b/);
    });
  }
  for (const size of [2,3,5,7]) {
    const team = engine.analyzePenta(charts.slice(0,size),Array.from({length:size},(_,i)=>`样例${i}`));
    team.filledRoles.forEach(v=>check(v.description,'team role'));
    team.missingRoles.forEach(v=>check(v.suggestion,'missing role'));
    team.recommendations.forEach(v=>check(v.insight,'team recommendation'));
    team.electromagnetics.forEach(v=>check(v.theme,'team theme'));
  }
  assert.equal(JSON.stringify(charts),originals,'display translation must not mutate calculations');
});

test('no translation-only disclosure; tooltip keeps the HD name with a parenthetical hexagram', () => {
  const source = readFileSync(new URL('../src/views/chart.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/source-original|查看英文原文|避免误造|缺乏统一授权/);
  assert.match(source,/\$\{esc\(ld.description\)\}/);
  assert.match(source,/\$\{esc\(hx.meaning\)\}/);
  assert.match(source,/\$\{esc\(gk.description\)\}/);
  for (const field of ['shadow', 'gift', 'siddhi']) {
    assert.ok(source.includes(`<span class="gk-${field}">\u0024{esc(geneKeyTerm(gateNum, '${field}'))}</span>`));
  }
  const graph = readFileSync(new URL('../src/bodygraph.js',import.meta.url),'utf8');
  for (const variable of ['gateNum', 'g']) {
    assert.ok(graph.includes(`formatDisplay('gateTooltip', displayGate(${variable}), hexagramName(${variable}))`));
  }
  assert.doesNotMatch(graph,/bg-tt-name/);
  assert.doesNotMatch(graph,/clampTooltip|tooltip-position/);
  const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/id="local-auth"|id="app" hidden/);
  const css = readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/\.local-auth|\.source-original|\.bg-tt-name/);
});
