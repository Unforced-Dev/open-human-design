/** Shared source lookup only. Translations remain owned by each locale. */
import * as engine from 'natalengine';

export function createChineseReadings({ catalog, templateSources, gates, lines, channels, hexagrams, vocabulary, crossAngles, crossLabel, unknown }) {
  const { zhCenter, zhGate, zhChannel, TYPE_ZH, AUTHORITY_ZH, PROFILE_ZH, DEFINITION_ZH, LINE_ZH, PLANET_ZH } = vocabulary;
  const messages = {};
  // Derive source-string lookups from the owned readings, never duplicate their prose.
  function indexReading(source, translated) {
    if (typeof source === 'string' && typeof translated === 'string') { messages[source] = translated; return; }
    if (source && typeof source === 'object') for (const key of Object.keys(source)) {
      indexReading(source[key], translated?.[key]);
    }
  }
  indexReading(engine.GATE_DESCRIPTIONS, gates);
  indexReading(engine.LINE_DESCRIPTIONS, lines);
  indexReading(engine.CHANNEL_DESCRIPTIONS, channels);
  indexReading(engine.HEXAGRAM_DESCRIPTIONS, hexagrams);
  // Generic engine terms can differ from the same word used as a hexagram title.
  Object.assign(messages, catalog);
  // A center name used inside an engine sentence has the same label as its card.
  for (const [key, center] of Object.entries(engine.CENTERS)) messages[center.name] = zhCenter(key);
  Object.assign(messages, AUTHORITY_ZH, DEFINITION_ZH, PLANET_ZH);
  for (const type of Object.values(engine.TYPES)) {
    const labels = TYPE_ZH[type.name];
    if (labels) for (const [i,field] of ['name','strategy','notSelf','signature'].entries()) messages[type[field]] = labels[i];
  }
  for (const [numbers, profile] of Object.entries(engine.PROFILES)) {
    if (PROFILE_ZH[numbers]) messages[profile.name] = PROFILE_ZH[numbers];
  }
  for (const [line,name] of Object.entries(engine.LINE_NAMES)) messages[name] = LINE_ZH[line];
  for (const [gate,data] of Object.entries(engine.GATES)) messages[data.name] = zhGate(gate);
  for (const channel of engine.CHANNELS) messages[channel.name] = zhChannel(channel.gates).replace(/通道$/, '');
  const escapePattern = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = templateSources.map(item => ({ ...item, parts: item.source.split(/\{\s*\d+\s*\}/g) }))
    .sort((a,b) => b.parts.join('').length - a.parts.join('').length)
    .map(item => ({ ...item, pattern: new RegExp('^' + item.parts.map(escapePattern).join('([\\s\\S]*?)') + '$') }));
  for (const item of templateSources) messages[item.source] = item.translation;

  function zhText(value, depth = 0) {
    if (!value || typeof value !== 'string') return value || '';
    if (Object.hasOwn(messages, value)) return messages[value];
    if (depth > 6) return value;
    const pair = value.match(/^([^+]+) \+ ([^:]+): ([\s\S]+)$/);
    if (pair) return `${zhText(pair[1],depth+1)} ＋ ${zhText(pair[2],depth+1)}：${zhText(pair[3],depth+1)}`;
    for (const { source, pattern } of patterns) {
      const match = value.match(pattern);
      if (match && messages[source]) return messages[source].replace(/\{\s*(\d+)\s*\}/g, (_,i) => zhText(match[Number(i)+1], depth+1));
    }
    // Engine summaries concatenate already-catalogued sentences. Keep all of them.
    const sentences = value.match(/[^.!?]+[.!?](?:\s+|$)|[^.!?]+$/g);
    if (sentences?.length > 1) return sentences.map(s => zhText(s.trim(),depth+1)).join(' ');
    const trimmed = value.trim();
    if (trimmed !== value) return zhText(trimmed,depth+1);
    const bare = value.replace(/[.]$/, '');
    if (Object.hasOwn(messages,bare)) return messages[bare] + (bare !== value ? '。' : '');
    if (value.includes(', ')) return value.split(', ').map(s=>zhText(s,depth+1)).join('、');
    const named = value.match(/^(.+) \((.+)\)$/);
    if (named) return `${zhText(named[1],depth+1)}（${zhText(named[2],depth+1)}）`;
    return value;
  }

  function zhCross(cross) {
    if (!cross) return unknown;
    const angle = crossAngles[cross.angleName] || '';
    const quartet = cross.gates?.length === 4 ? `（${cross.gates[0]}/${cross.gates[1]} | ${cross.gates[2]}/${cross.gates[3]}）` : '';
    return `${angle}${crossLabel}${zhText(cross.name)}${quartet}`;
  }

  return { text: zhText, cross: zhCross };
}
