// NatalEngine 1.6.0 truncates seconds in both the transit Date reader and the
// astronomy Date constructor. Keep this temporary patch reproducible until
// the dependency supports second-precision transits. Other calculators retain
// their existing behavior. Fail explicitly if the pinned source changes.
import { readFile, writeFile } from 'node:fs/promises';

const entry = import.meta.resolve('natalengine');
const pkg = JSON.parse(await readFile(new URL('../package.json', entry), 'utf8'));
if (pkg.version !== '1.6.0') throw new Error('Recheck the transit seconds patch before upgrading NatalEngine.');

const patches = [
  ['calculators/hd-transits.js', [
    ['hour = now.getUTCHours() + now.getUTCMinutes() / 60;',
      'hour = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;'],
    ['hour = transitDate.getHours() + transitDate.getMinutes() / 60;',
      'hour = transitDate.getHours() + transitDate.getMinutes() / 60 + transitDate.getSeconds() / 3600;'],
    ['calculateBirthPositions(year, month, day, hour, timezone);',
      'calculateBirthPositions(year, month, day, hour, timezone, null, null, { preserveSeconds: true });']
  ]],
  ['calculators/astronomy.js', [
    ['const date = new Date(Date.UTC(adjYear, adjMonth - 1, adjDay, Math.floor(adjHour), (adjHour % 1) * 60));',
      `const date = options.preserveSeconds
    ? new Date(Date.UTC(adjYear, adjMonth - 1, adjDay) + Math.round(adjHour * 3600000))
    : new Date(Date.UTC(adjYear, adjMonth - 1, adjDay, Math.floor(adjHour), (adjHour % 1) * 60));`]
  ]]
];

// Validate every replacement before writing any file; rerunning is harmless.
const updates = await Promise.all(patches.map(async ([path, replacements]) => {
  const url = new URL(path, entry);
  let source = await readFile(url, 'utf8');
  for (const [before, after] of replacements) {
    if (source.includes(after)) continue;
    if (source.split(before).length !== 2) throw new Error(`Unexpected NatalEngine source: ${path}`);
    source = source.replace(before, after);
  }
  return { url, source };
}));
for (const { url, source } of updates) await writeFile(url, source);
