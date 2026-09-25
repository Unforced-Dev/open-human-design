/** Read-only display dictionaries. English reads the original engine objects. */
import * as engine from 'natalengine';
import { getLocaleResources } from './i18n.js';

const content = () => getLocaleResources().content;
function dictionary(name) {
  return new Proxy(engine[name], {
    get: (_source, key) => content().data[name]?.[key] ?? engine[name][key],
    set: () => false
  });
}
export const GATE_DESCRIPTIONS = dictionary('GATE_DESCRIPTIONS');
export const LINE_DESCRIPTIONS = dictionary('LINE_DESCRIPTIONS');
export const CHANNEL_DESCRIPTIONS = dictionary('CHANNEL_DESCRIPTIONS');
export const HEXAGRAM_DESCRIPTIONS = dictionary('HEXAGRAM_DESCRIPTIONS');
export const GENE_KEY_DESCRIPTIONS = dictionary('GENE_KEY_DESCRIPTIONS');
export const contentText = value => content().text(value);
export const crossName = cross => content().cross(cross);

/** Keep the source term alongside Chinese Gene Keys keywords for comparison. */
export function geneKeyTerm(gate, field) {
  const original = engine.GENE_KEY_DESCRIPTIONS[gate]?.[field] || '';
  const translated = GENE_KEY_DESCRIPTIONS[gate]?.[field] || original;
  return content().bilingualGeneKeys && original && translated !== original
    ? `${translated} ${original}` : translated;
}
