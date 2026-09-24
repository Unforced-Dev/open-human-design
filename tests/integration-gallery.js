import '../src/styles.css';
import { renderBodygraph } from '../src/bodygraph.js';
import { CHANNELS } from 'natalengine';
const style = document.createElement('style');
style.textContent = `.gallery{max-width:1200px;margin:32px auto;padding:0 20px}.gallery h1{font-size:26px}.gallery p{color:var(--text-secondary);margin:12px 0;line-height:1.7}.controls{display:flex;gap:20px;align-items:center;margin:24px 0;flex-wrap:wrap}.controls select{padding:8px;border:1px solid var(--border);border-radius:8px;color:var(--text);background:var(--bg-elevated)}#cases{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}.case{background:var(--bg-elevated);border:1px solid var(--border);border-radius:12px;padding:20px}.case h2{font-size:18px}.case p{font-size:12px;min-height:40px}.case .bodygraph-svg{width:100%;max-height:none}.case .bg-svg-wrap{width:100%}.case .bg-grid{display:block}`;
document.head.append(style);
const cases = [[20,57],[10,20,34,57],[10,34],[20,34],[10,57],[10,20],[34,57], [20],[10],[34],[57], [], [10,20,34],[10,20,57],[10,34,57],[20,34,57]];
function render() {
  const source = document.getElementById('source').value;
  const container = document.getElementById('cases');
  container.innerHTML = '';
  for (const active of cases) {
    const channels = CHANNELS.filter(c => c.gates.every(g => active.includes(g)));
    const gates = { all: active, personality: {}, design: {} };
    active.forEach((gate,i) => {
      const activation = { gate, line: 1 };
      if (source === 'personality' || source === 'both' || source === 'mixed' && [10,20].includes(gate)) gates.personality['p'+i] = activation;
      if (source === 'design' || source === 'both' || source === 'mixed' && [34,57].includes(gate)) gates.design['p'+i] = activation;
    });
    const chart = { gates, channels, centers: {definedNames: [...new Set(channels.flatMap(c => c.centers))]} };
    const card = document.createElement('section'); card.className = 'case'; card.dataset.gates = active.join('-');
    card.innerHTML = `<h2>${active.length ? active.join(' + ') : 'No active gates'}</h2><p>${channels.length ? 'Complete channels: ' + channels.map(c => c.gates.join('–')).join(', ') : 'No complete channels'}</p><div class="fixture-graph"></div>`;
    container.append(card);
    renderBodygraph(card.querySelector('.fixture-graph'), chart, {compact:true, animate:false});
    card.querySelector('svg').setAttribute('viewBox', '0 400 490 640');
  }
}
document.getElementById('source').addEventListener('change', render);
document.getElementById('theme').addEventListener('click', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; render();
});
render();
