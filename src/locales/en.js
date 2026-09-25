import * as engine from 'natalengine';
import contexts from './ui-contexts.json' with { type: 'json' };
const TYPES = Object.fromEntries(Object.values(engine.TYPES).map(type => [type.name, type]));
const CHANNELS = Object.fromEntries(engine.CHANNELS.map(channel => [channel.gates.join('-'), channel.name]));
const PLANETS = { sun:'Sun', earth:'Earth', moon:'Moon', northNode:'North Node', southNode:'South Node', mercury:'Mercury', venus:'Venus', mars:'Mars', jupiter:'Jupiter', saturn:'Saturn', uranus:'Uranus', neptune:'Neptune', pluto:'Pluto' };
const TYPE_PLAIN = {
  Generator: "You have sustainable life-force energy. Life works best when you respond to what shows up rather than chasing what isn't there yet.",
  'Manifesting Generator': 'You have powerful, fast-moving energy for many things at once. Respond first, then inform the people your actions will affect.',
  Manifestor: "You're here to initiate. You don't need to wait for anyone — but informing people before you act keeps the path clear.",
  Projector: "You're here to guide others and see systems clearly. Your gifts land when they're recognized and invited, not pushed.",
  Reflector: 'You mirror the health of your community. Take a full lunar cycle (~28 days) before big decisions and choose your environments carefully.'
};
const english = {
  typeName: name => name || '—',
  strategy: name => TYPES[name]?.strategy || '—',
  notSelf: name => TYPES[name]?.notSelf || '—',
  signature: name => TYPES[name]?.signature || '—',
  authorityName: name => name || '—',
  profileName: numbers => engine.PROFILES[numbers]?.name || '',
  definitionName: value => value || '—',
  centerName: key => engine.CENTERS[key]?.name || key || '—',
  gateName: n => engine.GATES[n]?.name || `Gate ${n}`,
  hexagramName: n => engine.HEXAGRAM_DESCRIPTIONS[n]?.name || `Hexagram ${n}`,
  channelName: gates => CHANNELS[Array.isArray(gates) ? gates.join('-') : gates] || String(gates),
  circuitName: value => value || '—',
  planetName: value => PLANETS[value] || value,
  lineName: value => engine.LINE_NAMES[value] || value,
  variable: slot => [slot?.name || '—', slot?.description || ''],
  cognition: name => name || '—',
  typeDescription: name => TYPE_PLAIN[name] || ''
};

const graphCenters = { head:'Head', ajna:'Ajna', throat:'Throat', g:'G', heart:'Ego', spleen:'Spleen', solar:'Solar Plexus', sacral:'Sacral', root:'Root' };
export default {
  code: 'en', label: 'English', matches: language => /^en(?:-|$)/i.test(language),
  messages: contexts.en,
  timeline: { locale: 'en-GB', messages: {} },
  vocabulary: { ...english, graphCenter: key => graphCenters[key] || key },
  content: { data: engine, text: value => value || '', cross: value => value?.fullName || value?.name || 'Unknown' },
  format: {
    sensitivity: value => value,
    list: items => items.length < 2 ? items[0] || '' : items.length === 2 ? items.join(' and ') : items.slice(0,-1).join(', ') + ' and ' + items.at(-1),
    separated: (items, kind) => items.join(kind === 'channels' ? '; ' : ', '),
    parentheses: value => '(' + value + ')',
    gateTooltip: (name, hexagram) => name,
    channelTooltip: (name, gates) => name + ' (' + gates + ')',
    channelDetail: (name, gates) => 'Channel of ' + name + ' (' + gates + ')',
    circuitSummary: (name, countLabel) => name.replace(/^./, c => c.toUpperCase()) + ' (' + countLabel + ')',
    lineTag: (line, name) => ' — Line ' + line + ', the ' + name,
    centerAria: (name, status, label) => name + ' center, ' + status,
    channelCenters: (keys, names) => keys.join(' ↔ '),
    inlineDate: date => ' (' + date + ')',
    originalTerm: name => '',
    separator: kind => kind === 'cognition' ? '—' : ' — ',
    birth: (date, time) => {
      const [y,m,d] = date.split('-').map(Number);
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      let out = months[m-1] + ' ' + d + ', ' + y;
      if (time) { const [h,min] = time.split(':').map(Number); out += ' · ' + (h % 12 || 12) + ':' + String(min).padStart(2,'0') + ' ' + (h >= 12 ? 'PM' : 'AM'); }
      return out;
    }
  }
};
