import * as SQLite from 'expo-sqlite';

// ─── Unified Line model ──────────────────────────────────────────────────────
//
// Swell's primary persisted artifact is a saved *line*. A line begins as a
// fragment (Drift) and can be optionally tagged with light context — a tide
// state, a terrain hint, a constellation tie — and may be shaped through
// Verso (which now contains the former Paradox tool as a mode).

export type LineMode =
  | 'fragment'   // raw drift capture
  | 'complete'   // verso fill-in-the-blank
  | 'paradox'    // verso paradox mode (formerly standalone)
  | 'distill'    // future verso modes
  | 'aphorism'
  | 'invert';

export type Line = {
  id: number;
  content: string;
  mode: LineMode;
  template: string | null;     // for verso fills, the template used
  tide: string | null;         // optional tide state tag
  terrain: string | null;      // optional terrain hint tag
  constellation: string | null;// optional relationship tag
  topic: string | null;        // optional topic/prompt (e.g. paradox topic)
  is_favorite: number;
  created_at: number;
};

export type LineInput = {
  content: string;
  mode?: LineMode;
  template?: string | null;
  tide?: string | null;
  terrain?: string | null;
  constellation?: string | null;
  topic?: string | null;
};

// ─── Legacy types (kept for read-compat with existing data) ──────────────────

export type DriftEntry = {
  id: number;
  content: string;
  tag: string;
  created_at: number;
};

export type TideEntry = {
  id: number;
  state: string;
  note: string | null;
  created_at: number;
};

export type VersoEntry = {
  id: number;
  template: string;
  completed_line: string;
  is_favorite: number;
  created_at: number;
};

export type ParadoxEntry = {
  id: number;
  content: string;
  prompt: string | null;
  created_at: number;
};

export type TerrainEntry = {
  id: number;
  cadence: string | null;
  exposure: string | null;
  traction: string | null;
  resonance: string | null;
  condition_title: string | null;
  created_at: number;
};

export type ConstellationEntry = {
  id: number;
  name: string;
  tie_kind: string | null;
  nearness: string | null;
  reciprocity: string | null;
  tension: string | null;
  circle: string | null;
  created_at: number;
};

let db: SQLite.SQLiteDatabase;

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('swell.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'fragment',
      template TEXT,
      tide TEXT,
      terrain TEXT,
      constellation TEXT,
      topic TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    -- Legacy tables — preserved so older installs keep their data readable.
    CREATE TABLE IF NOT EXISTS drift_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      tag TEXT NOT NULL DEFAULT 'thought',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS tide_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS verso_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template TEXT NOT NULL,
      completed_line TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS paradox_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      prompt TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS terrain_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cadence TEXT,
      exposure TEXT,
      traction TEXT,
      resonance TEXT,
      condition_title TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS constellation_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tie_kind TEXT,
      nearness TEXT,
      reciprocity TEXT,
      tension TEXT,
      circle TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  await migrateLegacyToLines();

  const count = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM lines'
  );

  if (!count || count.count === 0) {
    await seedLines();
  }
}

// One-shot, idempotent migration: copy legacy drift/verso/paradox rows into
// `lines` if they have not already been migrated. Tide/terrain/constellation
// were standalone logs in the old model — they are not migrated as lines.
async function migrateLegacyToLines(): Promise<void> {
  const migrated = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM config WHERE key = 'lines_migrated_v1'"
  );
  if (migrated?.value === 'true') return;

  const drift = await db.getAllAsync<DriftEntry>('SELECT * FROM drift_entries');
  for (const e of drift) {
    await db.runAsync(
      'INSERT INTO lines (content, mode, created_at) VALUES (?, ?, ?)',
      e.content,
      'fragment',
      e.created_at
    );
  }
  const verso = await db.getAllAsync<VersoEntry>('SELECT * FROM verso_entries');
  for (const e of verso) {
    await db.runAsync(
      'INSERT INTO lines (content, mode, template, is_favorite, created_at) VALUES (?, ?, ?, ?, ?)',
      e.completed_line,
      'complete',
      e.template,
      e.is_favorite,
      e.created_at
    );
  }
  const paradox = await db.getAllAsync<ParadoxEntry>('SELECT * FROM paradox_entries');
  for (const e of paradox) {
    await db.runAsync(
      'INSERT INTO lines (content, mode, topic, created_at) VALUES (?, ?, ?, ?)',
      e.content,
      'paradox',
      e.prompt,
      e.created_at
    );
  }

  await db.runAsync(
    "INSERT INTO config (key, value) VALUES ('lines_migrated_v1', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
}

async function seedLines(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;

  await db.execAsync(`
    INSERT INTO lines (content, mode, tide, terrain, created_at) VALUES
      ('the best ideas arrive when you''re doing something else', 'fragment', 'glass water', null, ${now - day * 4}),
      ('a sentence written in salt', 'fragment', null, 'still', ${now - day * 3}),
      ('ambition is just impatience dressed up', 'paradox', null, null, ${now - day * 2}),
      ('what if slow is the whole point', 'fragment', 'low tide', null, ${now - day}),
      ('everything interesting happens at the edges', 'fragment', null, null, ${now - Math.floor(day * 0.5)});

    INSERT INTO lines (content, mode, template, is_favorite, created_at) VALUES
      ('The ocean is a mirror for the restless mind.', 'complete', 'The ocean is a _ for the _ mind.', 1, ${now - day * 4}),
      ('Clarity is the price of solitude.', 'complete', '_ is the price of _.', 1, ${now - day});
  `);
}

// ─── Lines API ───────────────────────────────────────────────────────────────

export async function addLine(input: LineInput): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO lines (content, mode, template, tide, terrain, constellation, topic, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.content,
    input.mode ?? 'fragment',
    input.template ?? null,
    input.tide ?? null,
    input.terrain ?? null,
    input.constellation ?? null,
    input.topic ?? null,
    Math.floor(Date.now() / 1000)
  );
  return result.lastInsertRowId;
}

export async function getLines(filter?: { mode?: LineMode }): Promise<Line[]> {
  if (filter?.mode) {
    return db.getAllAsync<Line>(
      'SELECT * FROM lines WHERE mode = ? ORDER BY is_favorite DESC, created_at DESC',
      filter.mode
    );
  }
  return db.getAllAsync<Line>(
    'SELECT * FROM lines ORDER BY is_favorite DESC, created_at DESC'
  );
}

export async function getRandomLine(): Promise<Line | null> {
  return db.getFirstAsync<Line>('SELECT * FROM lines ORDER BY RANDOM() LIMIT 1');
}

export async function getLineById(id: number): Promise<Line | null> {
  return db.getFirstAsync<Line>('SELECT * FROM lines WHERE id = ?', id);
}

export async function toggleLineFavorite(id: number, isFavorite: boolean): Promise<void> {
  await db.runAsync(
    'UPDATE lines SET is_favorite = ? WHERE id = ?',
    isFavorite ? 1 : 0,
    id
  );
}

export async function deleteLine(id: number): Promise<void> {
  await db.runAsync('DELETE FROM lines WHERE id = ?', id);
}

// ─── Custom templates ────────────────────────────────────────────────────────

export async function addCustomTemplate(template: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO custom_templates (template, created_at) VALUES (?, ?)',
    template,
    Math.floor(Date.now() / 1000)
  );
}

export async function getCustomTemplates(): Promise<Array<{ id: number; template: string }>> {
  return db.getAllAsync<{ id: number; template: string }>(
    'SELECT id, template FROM custom_templates ORDER BY created_at DESC'
  );
}

// ─── Config ──────────────────────────────────────────────────────────────────

export async function getConfig(key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM config WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export async function exportAllData(): Promise<string> {
  const lines = await getLines();
  const fmt = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  let out = `SWELL — Export ${new Date().toLocaleDateString()}\n\n`;
  out += `=== LINES ===\n`;
  for (const l of lines) {
    const tags: string[] = [];
    if (l.tide) tags.push(`tide:${l.tide}`);
    if (l.terrain) tags.push(`terrain:${l.terrain}`);
    if (l.constellation) tags.push(`with:${l.constellation}`);
    if (l.topic) tags.push(`topic:${l.topic}`);
    const meta = [
      fmt(l.created_at),
      l.mode,
      l.is_favorite ? '★' : null,
      tags.length ? tags.join(' · ') : null,
    ].filter(Boolean).join(' | ');
    out += `\n[${meta}]\n${l.content}\n`;
  }
  return out;
}

// ─── Clear ───────────────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  await db.execAsync(`
    DELETE FROM lines;
    DELETE FROM custom_templates;
    DELETE FROM drift_entries;
    DELETE FROM tide_entries;
    DELETE FROM verso_entries;
    DELETE FROM paradox_entries;
    DELETE FROM terrain_entries;
    DELETE FROM constellation_entries;
    DELETE FROM config WHERE key = 'lines_migrated_v1';
  `);
}
