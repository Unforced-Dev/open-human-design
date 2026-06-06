/**
 * Team view — Penta/group analysis. Members come from saved people
 * (checkboxes) plus optional quick-add rows.
 */

import { analyzePenta } from 'natalengine';
import { computeChart } from '../lib/chartdata.js';
import { listPeople, birthFromPerson } from '../lib/people.js';
import { esc } from '../lib/format.js';
import { getCurrentChart } from './chart.js';

export function setupTeamView() {
  document.getElementById('add-member').addEventListener('click', addMemberRow);
  document.getElementById('team-calculate').addEventListener('click', runTeamAnalysis);
  addMemberRow(); // never present an empty void — one ready row invites input
}

/** Refresh saved-people checkboxes each time the view opens. */
export function renderTeamView() {
  const wrap = document.getElementById('team-saved');
  const people = listPeople();
  const current = getCurrentChart();
  if (!people.length) {
    wrap.innerHTML = '<p class="panel-intro">A team needs at least two people — add their birth data below, or save charts first to pick them by name.</p>';
    return;
  }
  wrap.innerHTML = `
    <div class="saved-people-label">Include</div>
    <div class="team-saved-list">
      ${people.map(p => `
        <label class="team-saved-person">
          <input type="checkbox" value="${esc(p.id)}" ${current?.birth?.id === p.id ? 'checked' : ''}>
          ${esc(p.name)}
        </label>
      `).join('')}
    </div>
  `;
}

function addMemberRow() {
  const membersContainer = document.getElementById('team-members');
  const row = document.createElement('div');
  row.className = 'team-member-row';
  row.innerHTML = `
    <input type="text" class="team-name" placeholder="Name">
    <input type="date" class="team-date" required>
    <input type="time" class="team-time" value="12:00">
    <input type="number" class="team-tz" value="0" min="-12" max="14" step="0.5" placeholder="UTC" title="UTC offset">
    <button class="remove-member" title="Remove">&times;</button>
  `;
  row.querySelector('.remove-member').addEventListener('click', () => row.remove());
  membersContainer.appendChild(row);
}

function runTeamAnalysis() {
  const current = getCurrentChart();
  const charts = [];
  const names = [];

  // Saved people (checkboxes)
  const people = listPeople();
  document.querySelectorAll('#team-saved input[type=checkbox]:checked').forEach(cb => {
    const person = people.find(p => p.id === cb.value);
    if (!person) return;
    // Reuse the already-computed chart for the current person
    if (current?.birth?.id === person.id) {
      charts.push(current.chart);
      names.push(person.name);
    } else {
      const data = computeChart(birthFromPerson(person));
      charts.push(data.chart);
      names.push(person.name);
    }
  });

  // Quick-add rows
  document.querySelectorAll('#team-members .team-member-row').forEach((row, i) => {
    const date = row.querySelector('.team-date').value;
    if (!date) return;
    const time = row.querySelector('.team-time').value || '12:00';
    const tz = parseFloat(row.querySelector('.team-tz').value) || 0;
    const name = row.querySelector('.team-name').value.trim() || `Person ${charts.length + 1}`;
    const data = computeChart({ birthDate: date, birthTime: time, timezone: tz });
    charts.push(data.chart);
    names.push(name);
  });

  if (charts.length < 2) {
    document.getElementById('team-content').innerHTML =
      '<p class="panel-intro">Add at least two people to analyze the group.</p>';
    return;
  }

  const result = analyzePenta(charts, names);
  renderTeamContent(result);
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
