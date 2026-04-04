/**
 * Bodygraph App — Main Application
 *
 * A beautiful, interactive Human Design chart application
 * powered by NatalEngine.
 */

import {
  calculateHumanDesign,
  calculateGeneKeys,
  compareHumanDesign,
  calculateHDTransits,
  analyzePenta,
  GATE_DESCRIPTIONS,
  CHANNEL_DESCRIPTIONS,
  CIRCUIT_GROUPS
} from 'natalengine';

import { renderBodygraph } from './bodygraph.js';

// ==========================================
// State
// ==========================================
let currentChart = null;
let currentGeneKeys = null;

// ==========================================
// Dark Mode
// ==========================================
function initTheme() {
  const saved = localStorage.getItem('bodygraph-theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('bodygraph-theme', isDark ? 'light' : 'dark');
}

// ==========================================
// Navigation
// ==========================================
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const views = {
    chart: ['chart-view'],
    transits: ['transits-view'],
    connection: ['connection-view'],
    team: ['team-view']
  };

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const view = link.dataset.view;

      // Update active nav
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // Toggle birth entry vs chart views
      const birthEntry = document.getElementById('birth-entry');
      if (!currentChart && view !== 'chart') {
        // Can't access other views without a chart
        return;
      }

      // Hide all views
      document.getElementById('chart-view').classList.add('hidden');
      document.getElementById('transits-view').classList.add('hidden');
      document.getElementById('connection-view').classList.add('hidden');
      document.getElementById('team-view').classList.add('hidden');

      if (currentChart) {
        birthEntry.classList.add('hidden');
        const viewIds = views[view];
        if (viewIds) viewIds.forEach(id => document.getElementById(id).classList.remove('hidden'));
      }
    });
  });
}

// ==========================================
// Panel Tabs
// ==========================================
function setupPanelTabs() {
  const tabs = document.querySelectorAll('.panel-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPanelContent(tab.dataset.panel);
    });
  });
}

// ==========================================
// Chart Calculation
// ==========================================
function calculateChart(birthDate, birthTime, timezone) {
  const [hours, minutes] = birthTime.split(':').map(Number);
  const birthHour = hours + minutes / 60;

  currentChart = calculateHumanDesign(birthDate, birthHour, timezone);
  currentGeneKeys = calculateGeneKeys(currentChart);

  return currentChart;
}

// ==========================================
// Escape HTML helper
// ==========================================
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================
// Render Chart View
// ==========================================
function renderChartView(chart) {
  // Show chart, hide entry
  document.getElementById('birth-entry').classList.add('hidden');
  document.getElementById('chart-view').classList.remove('hidden');

  // Type banner
  const typeColors = {
    'Generator': 'var(--generator)',
    'Manifesting Generator': 'var(--manifesting-generator)',
    'Manifestor': 'var(--manifestor)',
    'Projector': 'var(--projector)',
    'Reflector': 'var(--reflector)'
  };

  const banner = document.getElementById('type-banner');
  banner.innerHTML = `
    <div class="type-name" style="color: ${typeColors[chart.type.name] || 'var(--text)'}">${esc(chart.type.name)}</div>
    <div class="type-detail">${esc(chart.profile.name)} Profile (${esc(chart.profile.numbers)}) &middot; ${esc(chart.authority.name)} &middot; ${esc(chart.definition)}</div>
    <div class="type-strategy">Strategy: ${esc(chart.type.strategy)}</div>
  `;

  // Bodygraph
  const bgContainer = document.getElementById('bodygraph-container');
  renderBodygraph(bgContainer, chart);

  // Foundation panel
  renderFoundation(chart);

  // Default panel tab
  renderPanelContent('centers');
}

function renderFoundation(chart) {
  const panel = document.getElementById('foundation-panel');
  const crossName = chart.incarnationCross?.fullName || chart.incarnationCross?.name || 'Unknown';

  const circuitDominant = chart.circuitAnalysis?.dominant;
  const circuitText = circuitDominant
    ? `${circuitDominant.name.charAt(0).toUpperCase() + circuitDominant.name.slice(1)} (${circuitDominant.channelCount} channels)`
    : 'None';

  panel.innerHTML = `
    <div class="panel-title">Foundation</div>
    <div class="foundation-grid">
      <div class="foundation-item">
        <div class="label">Type</div>
        <div class="value">${esc(chart.type.name)}</div>
        <div class="detail">${esc(chart.type.description)}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Strategy</div>
        <div class="value">${esc(chart.type.strategy)}</div>
        <div class="detail">Signature: ${esc(chart.type.signature)} &middot; Not-Self: ${esc(chart.type.notSelf)}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Authority</div>
        <div class="value">${esc(chart.authority.name)}</div>
        <div class="detail">${esc(chart.authority.description)}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Profile</div>
        <div class="value">${esc(chart.profile.numbers)}</div>
        <div class="detail">${esc(chart.profile.name)}: ${esc(chart.profile.theme)}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Incarnation Cross</div>
        <div class="value">${esc(crossName)}</div>
        <div class="detail">Gates: ${chart.incarnationCross?.gates?.join(', ') || 'N/A'}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Dominant Circuit</div>
        <div class="value">${esc(circuitText)}</div>
        <div class="detail">${circuitDominant ? esc(CIRCUIT_GROUPS[circuitDominant.name]?.theme || '') : 'No defined channels'}</div>
      </div>
    </div>
  `;
}

// ==========================================
// Panel Content Renderers
// ==========================================
function renderPanelContent(panel) {
  if (!currentChart) return;
  const container = document.getElementById('panel-content');

  switch (panel) {
    case 'centers': renderCentersPanel(container); break;
    case 'channels': renderChannelsPanel(container); break;
    case 'gates': renderGatesPanel(container); break;
    case 'variable': renderVariablePanel(container); break;
    case 'cross': renderCrossPanel(container); break;
  }
}

function renderCentersPanel(container) {
  const chart = currentChart;
  const definedHtml = chart.centers.defined.map(c => `
    <div class="center-card defined">
      <div class="center-status defined">Defined</div>
      <div class="center-name">${esc(c.name)}</div>
      <p>${esc(c.definedMeaning || c.pressure)}</p>
    </div>
  `).join('');

  const undefinedHtml = chart.centers.undefined.map(c => `
    <div class="center-card undefined">
      <div class="center-status undefined">Undefined</div>
      <div class="center-name">${esc(c.name)}</div>
      <p>${esc(c.undefinedMeaning)}</p>
      <p style="margin-top:6px;font-style:italic;font-size:12px;color:var(--text-tertiary)">${esc(c.notSelfQuestion)}</p>
    </div>
  `).join('');

  const openHtml = chart.centers.open.map(c => `
    <div class="center-card open">
      <div class="center-status open">Open</div>
      <div class="center-name">${esc(c.name)}</div>
      <p>${esc(c.openMeaning)}</p>
      <p style="margin-top:6px;font-style:italic;font-size:12px;color:var(--text-tertiary)">${esc(c.notSelfQuestion)}</p>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="panel-title">Centers (${chart.centers.definedNames.length} Defined / ${chart.centers.undefinedNames.length} Undefined / ${chart.centers.openNames.length} Open)</div>
    ${definedHtml}
    ${undefinedHtml}
    ${openHtml}
  `;
}

function renderChannelsPanel(container) {
  const chart = currentChart;

  if (chart.channels.length === 0) {
    container.innerHTML = '<div class="panel-title">Channels</div><p>No defined channels (Reflector type)</p>';
    return;
  }

  const channelsHtml = chart.channels.map(ch => {
    const key = `${ch.gates[0]}-${ch.gates[1]}`;
    const desc = CHANNEL_DESCRIPTIONS[key];
    return `
      <div class="channel-item" onclick="this.classList.toggle('expanded')">
        <div class="channel-name">
          ${esc(ch.name)} (${ch.gates.join('-')})
          <span class="circuit-badge ${ch.circuit}">${esc(ch.circuit)}</span>
        </div>
        <div class="channel-meta">${esc(ch.theme)} &middot; ${esc(ch.centers.join(' → '))}</div>
        ${desc ? `<div class="gate-description">${esc(desc.description)}<br><br><em>When defined: ${esc(desc.whenDefined)}</em></div>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="panel-title">Channels (${chart.channels.length} Defined)</div>
    ${channelsHtml}
  `;
}

function renderGatesPanel(container) {
  const chart = currentChart;
  const allGates = chart.gates.all.sort((a, b) => a - b);

  const gatesHtml = allGates.map(gateNum => {
    const desc = GATE_DESCRIPTIONS[gateNum];
    const personality = Object.entries(chart.gates.personality).find(([, g]) => g?.gate === gateNum);
    const design = Object.entries(chart.gates.design).find(([, g]) => g?.gate === gateNum);

    const activations = [];
    if (personality) activations.push(`P: ${personality[0]} L${personality[1].line}`);
    if (design) activations.push(`D: ${design[0]} L${design[1].line}`);

    return `
      <div class="gate-item" onclick="this.classList.toggle('expanded')">
        <div class="gate-name">Gate ${gateNum}: ${esc(desc?.keynote || '')}</div>
        <div class="gate-meta">${activations.join(' &middot; ')}</div>
        ${desc ? `<div class="gate-description">${esc(desc.description)}</div>` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="panel-title">Active Gates (${allGates.length})</div>
    ${gatesHtml}
  `;
}

function renderVariablePanel(container) {
  const v = currentChart.variable;
  if (!v) {
    container.innerHTML = '<div class="panel-title">Variable</div><p>Variable data unavailable.</p>';
    return;
  }

  const arrowSymbol = (dir) => dir === 'left' ? '◄' : '►';

  container.innerHTML = `
    <div class="panel-title">Variable — ${esc(v.notation)}</div>
    <div class="variable-grid">
      <div class="arrow-card">
        <div class="arrow-direction">${arrowSymbol(v.determination.arrow)} Top Left</div>
        <div class="arrow-label">Determination (Diet)</div>
        <div class="arrow-type">${esc(v.determination.name)}</div>
        <div class="arrow-desc">${esc(v.determination.description)}</div>
        ${v.determination.cognition ? `<div class="arrow-desc" style="margin-top:8px"><strong>Cognition:</strong> ${esc(v.determination.cognition.name)} — ${esc(v.determination.cognition.description)}</div>` : ''}
      </div>
      <div class="arrow-card">
        <div class="arrow-direction">${arrowSymbol(v.perspective.arrow)} Top Right</div>
        <div class="arrow-label">Perspective (View)</div>
        <div class="arrow-type">${esc(v.perspective.name)}</div>
        <div class="arrow-desc">${esc(v.perspective.description)}</div>
      </div>
      <div class="arrow-card">
        <div class="arrow-direction">${arrowSymbol(v.environment.arrow)} Bottom Left</div>
        <div class="arrow-label">Environment</div>
        <div class="arrow-type">${esc(v.environment.name)}</div>
        <div class="arrow-desc">${esc(v.environment.description)}</div>
      </div>
      <div class="arrow-card">
        <div class="arrow-direction">${arrowSymbol(v.motivation.arrow)} Bottom Right</div>
        <div class="arrow-label">Motivation</div>
        <div class="arrow-type">${esc(v.motivation.name)}</div>
        <div class="arrow-desc">${esc(v.motivation.description)}</div>
      </div>
    </div>
  `;
}

function renderCrossPanel(container) {
  const chart = currentChart;
  const cross = chart.incarnationCross;

  if (!cross) {
    container.innerHTML = '<div class="panel-title">Incarnation Cross</div><p>Cross data unavailable.</p>';
    return;
  }

  const geneKeysHtml = currentGeneKeys ? `
    <div style="margin-top:20px">
      <div class="panel-title">Gene Keys — Activation Sequence</div>
      <div class="foundation-grid">
        ${['lifeWork', 'evolution', 'radiance', 'purpose'].map(sphere => {
          const s = currentGeneKeys.activationSequence[sphere];
          return s ? `
            <div class="foundation-item">
              <div class="label">${esc(s.sphere)}</div>
              <div class="value">Key ${s.key}</div>
              <div class="detail">${esc(s.shadow)} → ${esc(s.gift)} → ${esc(s.siddhi)}</div>
            </div>
          ` : '';
        }).join('')}
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="panel-title">Incarnation Cross</div>
    <div class="panel-heading">${esc(cross.fullName || cross.name)}</div>
    <p>${esc(cross.angle || '')} ${cross.theme ? '— ' + esc(cross.theme) : ''}</p>
    <div style="margin-top:12px">
      <div class="foundation-grid">
        ${cross.gates.map((gate, i) => {
          const labels = ['Personality Sun', 'Personality Earth', 'Design Sun', 'Design Earth'];
          return `
            <div class="foundation-item">
              <div class="label">${labels[i]}</div>
              <div class="value">Gate ${gate}</div>
              <div class="detail">${esc(cross.gateNames?.[i] || '')}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ${geneKeysHtml}
  `;
}

// ==========================================
// Transit View
// ==========================================
function setupTransitView() {
  const dateInput = document.getElementById('transit-date');
  const todayBtn = document.getElementById('transit-today');

  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;

  const updateTransits = () => {
    if (!currentChart) return;
    const overlay = calculateHDTransits(currentChart, dateInput.value);
    renderTransitContent(overlay);
  };

  dateInput.addEventListener('change', updateTransits);
  todayBtn.addEventListener('click', () => {
    dateInput.value = new Date().toISOString().split('T')[0];
    updateTransits();
  });
}

function renderTransitContent(overlay) {
  const container = document.getElementById('transit-content');

  const sunGate = overlay.highlights.sun;
  const moonGate = overlay.highlights.moon;

  const completionsHtml = overlay.channelCompletions.length > 0
    ? overlay.channelCompletions.map(c => `
        <div class="transit-completion ${c.significance}">
          <div class="completion-title">${esc(c.channel)} (${c.gates.join('-')})</div>
          <div class="completion-detail">
            ${c.natalGate ? `Your Gate ${c.natalGate} is completed by transit Gate ${c.transitGate} (${esc(c.transitPlanet)}).` : `Pure transit channel — both gates activated by current planets.`}
            <span class="circuit-badge ${c.circuit}">${esc(c.circuit)}</span>
          </div>
        </div>
      `).join('')
    : '<p style="color:var(--text-secondary)">No channel completions from today\'s transits.</p>';

  const tempCentersHtml = overlay.temporarilyDefinedCenters.length > 0
    ? overlay.temporarilyDefinedCenters.map(c => `
        <div class="center-card defined" style="margin-bottom:6px">
          <div class="center-name">${esc(c.centerName)}</div>
          <div class="center-status defined">Temporarily Defined</div>
          <p>${esc(c.theme)} — Usually undefined in your chart, this center is activated today by transits.</p>
        </div>
      `).join('')
    : '';

  const reinforcedHtml = overlay.reinforcedGates.length > 0
    ? `<div style="margin-top:16px">
        <div class="panel-title">Reinforced Gates (${overlay.reinforcedGates.length})</div>
        ${overlay.reinforcedGates.slice(0, 8).map(g => `
          <div class="gate-item" style="margin-bottom:4px">
            <div class="gate-name">Gate ${g.gate}: ${esc(g.gateName)}</div>
            <div class="gate-meta">${esc(g.meaning)}</div>
          </div>
        `).join('')}
       </div>`
    : '';

  container.innerHTML = `
    <div class="foundation-grid" style="margin-bottom:20px">
      <div class="foundation-item">
        <div class="label">Transit Sun</div>
        <div class="value">Gate ${sunGate.gate} Line ${sunGate.line}</div>
        <div class="detail">${esc(sunGate.gateName)}${sunGate.reinforcesNatal ? ' — reinforces your natal gate' : ''}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Transit Moon</div>
        <div class="value">Gate ${moonGate.gate} Line ${moonGate.line}</div>
        <div class="detail">${esc(moonGate.gateName)}${moonGate.reinforcesNatal ? ' — reinforces your natal gate' : ''}</div>
      </div>
    </div>

    <div class="panel-title">Channel Completions (${overlay.stats.channelCompletions})</div>
    ${completionsHtml}
    ${tempCentersHtml}
    ${reinforcedHtml}
  `;
}

// ==========================================
// Connection View
// ==========================================
function setupConnectionView() {
  document.getElementById('conn-calculate').addEventListener('click', () => {
    if (!currentChart) return;

    const date = document.getElementById('conn-date').value;
    const time = document.getElementById('conn-time').value;
    const tz = parseFloat(document.getElementById('conn-tz').value) || 0;

    if (!date) return;

    const [hours, minutes] = time.split(':').map(Number);
    const birthHour = hours + minutes / 60;

    const chartB = calculateHumanDesign(date, birthHour, tz);
    const comparison = compareHumanDesign(currentChart, chartB);

    renderConnectionContent(comparison, chartB);
  });
}

function renderConnectionContent(comparison, chartB) {
  const container = document.getElementById('connection-content');
  const cc = comparison.connectionChart;

  const renderConnections = (items, label, color) => {
    if (items.length === 0) return '';
    return `
      <div style="margin-bottom:16px">
        <div class="panel-title">${label} (${items.length})</div>
        ${items.map(c => `
          <div class="connection-type" style="border-left:3px solid ${color}">
            <div class="conn-channel">${esc(c.channel)} (${c.gates.join('-')})</div>
            <div class="conn-desc">${esc(c.description)}</div>
          </div>
        `).join('')}
      </div>
    `;
  };

  container.innerHTML = `
    <div class="foundation-grid" style="margin-bottom:20px">
      <div class="foundation-item">
        <div class="label">Composite Type</div>
        <div class="value">${esc(cc.compositeType)}</div>
        <div class="detail">${cc.compositeChannelCount} channels together</div>
      </div>
      <div class="foundation-item">
        <div class="label">Type Dynamic</div>
        <div class="value">${esc(comparison.typeInteraction.dynamic)}</div>
        <div class="detail">${esc(comparison.typeInteraction.typeA)} + ${esc(comparison.typeInteraction.typeB)}</div>
      </div>
    </div>

    ${renderConnections(cc.connections.electromagnetic, 'Electromagnetic — New Energy Together', 'var(--electromagnetic)')}
    ${renderConnections(cc.connections.companionship, 'Companionship — Shared Understanding', 'var(--integration)')}
    ${renderConnections(cc.connections.compromise, 'Compromise — One Leads', 'var(--collective)')}
    ${renderConnections(cc.connections.dominance, 'Dominance — One-Way Conditioning', 'var(--text-tertiary)')}

    <div class="panel-title">Summary</div>
    <p>${esc(comparison.summary)}</p>
  `;
}

// ==========================================
// Team View
// ==========================================
function setupTeamView() {
  const membersContainer = document.getElementById('team-members');
  let memberCount = 0;

  function addMember() {
    memberCount++;
    const row = document.createElement('div');
    row.className = 'team-member-row';
    row.innerHTML = `
      <input type="date" class="team-date" placeholder="Birth Date" required>
      <input type="time" class="team-time" value="12:00">
      <input type="number" class="team-tz" value="0" min="-12" max="14" step="0.5" placeholder="UTC">
      <button class="remove-member" title="Remove">&times;</button>
    `;
    row.querySelector('.remove-member').addEventListener('click', () => {
      row.remove();
      memberCount--;
    });
    membersContainer.appendChild(row);
  }

  // Start with 3 members
  addMember(); addMember(); addMember();

  document.getElementById('add-member').addEventListener('click', addMember);

  document.getElementById('team-calculate').addEventListener('click', () => {
    const rows = membersContainer.querySelectorAll('.team-member-row');
    const charts = [];
    const names = [];

    rows.forEach((row, i) => {
      const date = row.querySelector('.team-date').value;
      if (!date) return;
      const time = row.querySelector('.team-time').value || '12:00';
      const tz = parseFloat(row.querySelector('.team-tz').value) || 0;
      const [h, m] = time.split(':').map(Number);
      charts.push(calculateHumanDesign(date, h + m / 60, tz));
      names.push(`Person ${i + 1}`);
    });

    if (charts.length < 2) return;

    // Include current chart as Person A if available
    if (currentChart) {
      charts.unshift(currentChart);
      names.unshift('You');
    }

    const result = analyzePenta(charts, names);
    renderTeamContent(result);
  });
}

function renderTeamContent(result) {
  const container = document.getElementById('team-content');

  const rolesHtml = [...result.filledRoles.map(r => `
    <div class="role-card filled">
      <div class="role-name">${esc(r.role)}</div>
      <div class="role-detail">${esc(r.description)}</div>
      <div class="role-detail" style="margin-top:4px"><strong>Filled by:</strong> ${r.contributors.map(esc).join(', ')}</div>
    </div>
  `), ...result.missingRoles.map(r => `
    <div class="role-card missing">
      <div class="role-name">${esc(r.role)} — Missing</div>
      <div class="role-detail">${esc(r.suggestion)}</div>
    </div>
  `)].join('');

  const recsHtml = result.recommendations.map(r => `
    <div class="recommendation-card">
      <div class="rec-category">${esc(r.category)}</div>
      <div class="rec-insight">${esc(r.insight)}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="foundation-grid" style="margin-bottom:20px">
      <div class="foundation-item">
        <div class="label">Group Type</div>
        <div class="value">${esc(result.groupType)}</div>
        <div class="detail">${esc(result.groupCareerType)}</div>
      </div>
      <div class="foundation-item">
        <div class="label">Members</div>
        <div class="value">${result.memberCount} ${result.isPenta ? '(Penta)' : ''}</div>
        <div class="detail">${result.stats.totalChannels} channels, ${result.stats.totalDefinedCenters} centers</div>
      </div>
    </div>

    <div class="panel-title">Team Roles</div>
    ${rolesHtml}

    ${result.electromagnetics.length > 0 ? `
      <div style="margin-top:16px">
        <div class="panel-title">Electromagnetic Connections (${result.electromagnetics.length})</div>
        ${result.electromagnetics.slice(0, 10).map(e => `
          <div class="connection-type" style="border-left:3px solid var(--electromagnetic)">
            <div class="conn-channel">${esc(e.channel)}</div>
            <div class="conn-desc">${esc(e.personA)} + ${esc(e.personB)} — ${esc(e.theme)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div style="margin-top:16px">
      <div class="panel-title">Recommendations</div>
      ${recsHtml}
    </div>
  `;
}

// ==========================================
// Initialize
// ==========================================
function init() {
  initTheme();
  setupNavigation();
  setupPanelTabs();
  setupTransitView();
  setupConnectionView();
  setupTeamView();

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Birth form
  document.getElementById('birth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = document.getElementById('birth-date').value;
    const time = document.getElementById('birth-time').value;
    const tz = parseFloat(document.getElementById('timezone').value);

    if (!date) return;

    const chart = calculateChart(date, time, tz);
    renderChartView(chart);

    // Pre-load transits
    const overlay = calculateHDTransits(chart, new Date().toISOString().split('T')[0]);
    renderTransitContent(overlay);
  });
}

init();
