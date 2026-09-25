/**
 * Team view — Penta/group analysis. Members come from saved people
 * (checkboxes) plus optional quick-add rows.
 */

import { analyzePenta } from 'natalengine';
import { computeChart } from '../lib/chartdata.js';
import { listPeople, birthFromPerson } from '../lib/people.js';
import { contentText } from '../lib/content.js';
import { createPlaceSearch } from '../lib/placesearch.js';
import { esc } from '../lib/format.js';
import { typeName, channelName } from '../lib/vocabulary.js';
import { t } from '../lib/i18n.js';
import { getCurrentChart } from './chart.js';


let latestTeamState = null;

export function setupTeamView() {
  document.getElementById('add-member').addEventListener('click', addMemberRow);
  document.getElementById('team-calculate').addEventListener('click', runTeamAnalysis);
  addMemberRow(); // never present an empty void — one ready row invites input
}

/** Refresh saved-people checkboxes each time the view opens. */
export function renderTeamView() {
  const wrap = document.getElementById('team-saved');
  const hadChoices = !!wrap.querySelector('.team-saved-list');
  const selectedIds = new Set([...wrap.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value));
  const people = listPeople();
  const current = getCurrentChart();
  if (!people.length) {
    wrap.innerHTML = `<p class="panel-intro">${t('A team needs at least two people — add their birth data below, or save charts first to pick them by name.')}</p>`;
    return;
  }
  wrap.innerHTML = `
    <div class="saved-people-label">${t('Include')}</div>
    <div class="team-saved-list">
      ${people.map(p => `
        <label class="team-saved-person">
          <input type="checkbox" value="${esc(p.id)}" ${(hadChoices ? selectedIds.has(p.id) : current?.birth?.id === p.id) ? 'checked' : ''}>
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
    <input type="text" class="team-name" placeholder="${esc(t('Name'))}">
    <input type="date" class="team-date" required>
    <input type="time" class="team-time" value="12:00">
    <div class="team-place"></div>
    <button class="remove-member" title="${esc(t('Remove'))}">&times;</button>
  `;
  const ps = createPlaceSearch(row.querySelector('.team-place'), {
    placeholder: 'Birth place',
    getDateTime: () => ({ date: row.querySelector('.team-date').value, time: row.querySelector('.team-time').value })
  });
  row._placeSearch = ps;
  row.querySelector('.remove-member').addEventListener('click', () => { ps.destroy(); row.remove(); });
  membersContainer.appendChild(row);
}

function runTeamAnalysis() {
  const current = getCurrentChart();
  const charts = [];
  const names = [];
  const generatedNames = new Map();

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
  document.querySelectorAll('#team-members .team-member-row').forEach((row) => {
    const date = row.querySelector('.team-date').value;
    if (!date) return;
    const time = row.querySelector('.team-time').value || '12:00';
    const loc = row._placeSearch?.getBirthLocation(date, time);
    if (!loc) { row._placeSearch?.flagMissing(); return; } // skip rather than chart at UTC=0
    const enteredName = row.querySelector('.team-name').value.trim();
    const number = charts.length + 1;
    const name = enteredName || t('Person {number}', { number });
    if (!enteredName) generatedNames.set(name, number);
    const data = computeChart({ birthDate: date, birthTime: time, timezone: loc.timezone, location: loc.lat != null ? loc : null });
    charts.push(data.chart);
    names.push(name);
  });

  if (charts.length < 2) {
    latestTeamState = { kind: 'error' };
    document.getElementById('team-content').innerHTML =
      `<p class="panel-intro">${t('Add at least two people to analyze the group.')}</p>`;
    return;
  }

  const result = analyzePenta(charts, names);
  latestTeamState = { kind: 'result', result, generatedNames };
  renderTeamContent(result, generatedNames);
}

export function refreshTeamLanguage() {
  renderTeamView();
  document.querySelectorAll('#team-members .team-member-row').forEach(row => {
    row.querySelector('.team-name').placeholder = t('Name');
    row.querySelector('.remove-member').title = t('Remove');
  });
  if (latestTeamState?.kind === 'result') renderTeamContent(latestTeamState.result, latestTeamState.generatedNames);
  else if (latestTeamState?.kind === 'error') {
    document.getElementById('team-content').innerHTML =
      `<p class="panel-intro">${t('Add at least two people to analyze the group.')}</p>`;
  }
}

function renderTeamContent(result, generatedNames = new Map()) {
  const container = document.getElementById('team-content');
  const displayName = name => generatedNames.has(name)
    ? t('Person {number}', { number: generatedNames.get(name) })
    : name;
  const rolesHtml = [...result.filledRoles.map(r => `
    <div class="role-card filled">
      <div class="role-name">${esc(contentText(r.role))}</div>
      <div class="role-detail">${esc(contentText(r.description))}</div>
      <div class="role-detail" style="margin-top:4px"><strong>${t('Filled by:')}</strong> ${r.contributors.map(displayName).map(esc).join(t(', '))}</div>
    </div>
  `), ...result.missingRoles.map(r => `
    <div class="role-card missing">
      <div class="role-name">${esc(contentText(r.role))} ${t('— Missing')}</div>
      <div class="role-detail">${esc(contentText(r.suggestion))}</div>
    </div>
  `)].join('');

  const recsHtml = result.recommendations.map(r => `
    <div class="recommendation-card">
      <div class="rec-category">${esc(t(r.category))}</div>
      <div class="rec-insight">${esc(contentText(r.insight))}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="foundation-grid" style="margin-bottom:20px">
      <div class="foundation-item">
        <div class="label">${t('Group Type')}</div>
        <div class="value">${esc(typeName(result.groupType))}</div>
        <div class="detail">${esc(contentText(result.groupCareerType))}</div>
      </div>
      <div class="foundation-item">
        <div class="label">${t('Members')}</div>
        <div class="value">${result.memberCount} ${result.isPenta ? t('(Penta)') : ''}</div>
        <div class="detail">${t('{channels} channels, {centers} centers', { channels: result.stats.totalChannels, centers: result.stats.totalDefinedCenters })}</div>
      </div>
    </div>

    <div class="panel-title">${t('Team Roles')}</div>
    ${rolesHtml}

    ${result.electromagnetics.length > 0 ? `
      <div style="margin-top:16px">
        <div class="panel-title">${t('Electromagnetic Connections ({count})', { count: result.electromagnetics.length })}</div>
        ${result.electromagnetics.slice(0, 10).map(e => `
          <div class="connection-type" style="border-left:3px solid var(--electromagnetic)">
            <div class="conn-channel">${esc(channelName(e.gates || e.channel))}</div>
            <div class="conn-desc">${esc(displayName(e.personA))} + ${esc(displayName(e.personB))} — ${esc(contentText(e.theme))}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div style="margin-top:16px">
      <div class="panel-title">${t('Recommendations')}</div>
      ${recsHtml}
    </div>
  `;
}
