/**
 * People sync — LWW deltas with tombstones (docs/PLATFORM.md §sync).
 *
 *   POST /api/sync  { since?: ISO, changes?: [PersonRecord] }
 *     → { now: ISO, changes: [PersonRecord incl. tombstones since `since`] }
 *
 * Per-record last-write-wins: an incoming change applies iff its updatedAt
 * is newer than the stored row's. Accepted writes are re-stamped with
 * server time so the cursor clock is trustworthy. Tombstones (deletedAt)
 * propagate like edits and never resurrect.
 *
 * Every field is validated and length-capped. A tombstone stores only its
 * id and time (the person's details are cleared) and only for a row the
 * server already holds: a delete for an id it never had has nothing to
 * propagate. Live rows are capped at MAX_PEOPLE_FREE; tombstones at the same
 * number again, oldest dropped first, so one account can't fill D1.
 */

// Generous while we grow — proper tier gating comes with payments later
// (decision 2026-06-06: make it all work for anyone with an account).
const MAX_PEOPLE_FREE = 100;
const MAX_ROWS = MAX_PEOPLE_FREE * 2; // live + tombstones
const MAX_BODY_BYTES = 256 * 1024;

function rowToWire(r) {
  if (r.deleted_at) return { id: r.id, updatedAt: r.updated_at, deletedAt: r.deleted_at };
  return {
    id: r.id,
    name: r.name,
    birthDate: r.birth_date,
    birthTime: r.birth_time,
    timeUnknown: !!r.time_unknown,
    location: (r.loc_lat != null || r.loc_name || r.loc_iana) ? {
      lat: r.loc_lat,
      lon: r.loc_lon,
      timezone: r.loc_timezone,
      iana: r.loc_iana,
      name: r.loc_name
    } : null,
    aiAccess: !!r.ai_access,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: null
  };
}

const isNum = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const optNum = (v, min, max) => v == null || isNum(v, min, max);
const optStr = (v, max) => v == null || (typeof v === 'string' && v.length <= max);
const isStamp = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validLocation(l) {
  if (l == null) return true;
  return typeof l === 'object' && !Array.isArray(l) &&
    optNum(l.lat, -90, 90) && optNum(l.lon, -180, 180) && optNum(l.timezone, -14, 14) &&
    optStr(l.iana, 64) && (l.iana == null || /^[A-Za-z0-9_+\-\/]+$/.test(l.iana)) &&
    optStr(l.name, 2000); // place labels are stored cut to 200
}

/** 'tombstone' | 'live' | null (rejected). */
export function classifyChange(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(c.id)) return null;
  if (c.updatedAt != null && !isStamp(c.updatedAt)) return null;
  if (c.deletedAt) return isStamp(c.deletedAt) ? 'tombstone' : null;
  const ok = typeof c.name === 'string' && c.name.length <= 200 &&
    validDate(c.birthDate) &&
    typeof c.birthTime === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(c.birthTime) &&
    validLocation(c.location) &&
    (c.createdAt == null || isStamp(c.createdAt));
  return ok ? 'live' : null;
}

export async function handleSync(env, session, request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return Response.json({ error: 'request too large' }, { status: 413 });
  }
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return Response.json({ error: 'request too large' }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const userId = session.user.id;
  const since = typeof body.since === 'string' ? body.since.slice(0, 40) : '';
  const changes = Array.isArray(body.changes) ? body.changes.slice(0, 200) : [];
  const now = new Date().toISOString();
  const count = async (where) => (await env.DB
    .prepare(`SELECT COUNT(*) AS cnt FROM people WHERE user_id = ?1 AND ${where}`)
    .bind(userId).first()).cnt;

  for (const c of changes) {
    const kind = classifyChange(c);
    if (!kind) continue;

    const existing = await env.DB
      .prepare('SELECT updated_at FROM people WHERE user_id = ?1 AND id = ?2')
      .bind(userId, c.id).first();

    // LWW: apply iff strictly newer than what we hold
    if (existing && String(c.updatedAt || '') <= existing.updated_at) continue;

    if (kind === 'tombstone') {
      if (!existing) continue; // never synced, nothing to propagate
      await env.DB.prepare(`
        UPDATE people SET name = '', birth_date = '', birth_time = '', time_unknown = 0,
          loc_lat = NULL, loc_lon = NULL, loc_timezone = NULL, loc_iana = NULL, loc_name = NULL,
          ai_access = 0, updated_at = ?1, deleted_at = ?1
        WHERE user_id = ?2 AND id = ?3
      `).bind(now, userId, c.id).run();
      continue;
    }

    if (!existing) {
      // Free-tier cap counts live (non-tombstoned) rows
      if (await count('deleted_at IS NULL') >= MAX_PEOPLE_FREE) continue; // silently skipped; pull won't echo it back
      // Bound tombstones too: make room by dropping the oldest one.
      if (await count('1 = 1') >= MAX_ROWS) {
        await env.DB.prepare(`
          DELETE FROM people WHERE user_id = ?1 AND id = (
            SELECT id FROM people WHERE user_id = ?1 AND deleted_at IS NOT NULL ORDER BY deleted_at LIMIT 1)
        `).bind(userId).run();
      }
    }

    await env.DB.prepare(`
      INSERT INTO people (user_id, id, name, birth_date, birth_time, time_unknown,
                          loc_lat, loc_lon, loc_timezone, loc_iana, loc_name,
                          ai_access, created_at, updated_at, deleted_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, NULL)
      ON CONFLICT (user_id, id) DO UPDATE SET
        name = excluded.name,
        birth_date = excluded.birth_date,
        birth_time = excluded.birth_time,
        time_unknown = excluded.time_unknown,
        loc_lat = excluded.loc_lat,
        loc_lon = excluded.loc_lon,
        loc_timezone = excluded.loc_timezone,
        loc_iana = excluded.loc_iana,
        loc_name = excluded.loc_name,
        ai_access = excluded.ai_access,
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `).bind(
      userId, c.id,
      c.name || 'Unnamed',
      c.birthDate,
      c.birthTime,
      c.timeUnknown ? 1 : 0,
      c.location?.lat ?? null,
      c.location?.lon ?? null,
      c.location?.timezone ?? null,
      c.location?.iana ?? null,
      c.location?.name?.slice(0, 200) ?? null,
      c.aiAccess ? 1 : 0,
      c.createdAt || now,
      now                        // server-stamped LWW clock
    ).run();
  }

  // Delta pull: everything newer than the client's cursor (incl. tombstones)
  const { results } = await env.DB.prepare(
    'SELECT * FROM people WHERE user_id = ?1 AND updated_at > ?2 ORDER BY updated_at'
  ).bind(userId, since).all();

  return Response.json({ now, changes: results.map(rowToWire) });
}
