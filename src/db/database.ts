import * as SQLite from 'expo-sqlite';

export type TideEntry = {
  id: number;
  state: string;
  note: string | null;
  created_at: number;
};

export type DriftEntry = {
  id: number;
  content: string;
  tag: string;
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

let db: SQLite.SQLiteDatabase;

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync('swell.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS tide_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS drift_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      tag TEXT NOT NULL DEFAULT 'thought',
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

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template TEXT NOT NULL,
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

  const count = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM drift_entries'
  );

  if (!count || count.count === 0) {
    await seedData();
  }
}

async function seedData(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;

  await db.execAsync(`
    INSERT INTO drift_entries (content, tag, created_at) VALUES
      ('the best ideas arrive when you''re doing something else', 'thought', ${now - day * 4}),
      ('a sentence written in salt', 'verse', ${now - day * 3}),
      ('ambition is just impatience dressed up', 'paradox', ${now - day * 2}),
      ('what if slow is the whole point', 'thought', ${now - day}),
      ('everything interesting happens at the edges', 'line', ${now - Math.floor(day * 0.5)});

    INSERT INTO tide_entries (state, note, created_at) VALUES
      ('glass water', 'finally', ${now - day * 5}),
      ('building chop', 'deadline tomorrow', ${now - day * 3}),
      ('offshore winds', null, ${now - day * 2}),
      ('golden hour calm', 'sunday feeling', ${now - day}),
      ('low tide', null, ${now - Math.floor(day * 0.3)});

    INSERT INTO verso_entries (template, completed_line, is_favorite, created_at) VALUES
      ('The ocean is a _ for the _ mind.', 'The ocean is a mirror for the restless mind.', 1, ${now - day * 4}),
      ('Coffee is _ disguised as _.', 'Coffee is urgency disguised as ritual.', 0, ${now - day * 2}),
      ('_ is the price of _.', 'Clarity is the price of solitude.', 1, ${now - day});

    INSERT INTO paradox_entries (content, prompt, created_at) VALUES
      ('The more clearly you see your destination,
the less certain you become
that you want to arrive.', 'ambition', ${now - day * 5}),
      ('Freedom is the only cage
that requires your consent.', 'freedom', ${now - day * 3}),
      ('Silence speaks most clearly
when no one is listening.', 'silence', ${now - day});
  `);
}

// Tide
export async function addTideEntry(state: string, note: string | null): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO tide_entries (state, note, created_at) VALUES (?, ?, ?)',
    state,
    note,
    Math.floor(Date.now() / 1000)
  );
  return result.lastInsertRowId;
}

export async function getTideEntries(): Promise<TideEntry[]> {
  return db.getAllAsync<TideEntry>(
    'SELECT * FROM tide_entries ORDER BY created_at DESC'
  );
}

export async function deleteTideEntry(id: number): Promise<void> {
  await db.runAsync('DELETE FROM tide_entries WHERE id = ?', id);
}

// Drift
export async function addDriftEntry(content: string, tag: string): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO drift_entries (content, tag, created_at) VALUES (?, ?, ?)',
    content,
    tag,
    Math.floor(Date.now() / 1000)
  );
  return result.lastInsertRowId;
}

export async function getDriftEntries(): Promise<DriftEntry[]> {
  return db.getAllAsync<DriftEntry>(
    'SELECT * FROM drift_entries ORDER BY created_at DESC'
  );
}

export async function getRandomDriftEntry(): Promise<DriftEntry | null> {
  return db.getFirstAsync<DriftEntry>(
    'SELECT * FROM drift_entries ORDER BY RANDOM() LIMIT 1'
  );
}

export async function deleteDriftEntry(id: number): Promise<void> {
  await db.runAsync('DELETE FROM drift_entries WHERE id = ?', id);
}

// Verso
export async function addVersoEntry(template: string, completedLine: string): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO verso_entries (template, completed_line, is_favorite, created_at) VALUES (?, ?, 0, ?)',
    template,
    completedLine,
    Math.floor(Date.now() / 1000)
  );
  return result.lastInsertRowId;
}

export async function getVersoEntries(): Promise<VersoEntry[]> {
  return db.getAllAsync<VersoEntry>(
    'SELECT * FROM verso_entries ORDER BY is_favorite DESC, created_at DESC'
  );
}

export async function toggleVersoFavorite(id: number, isFavorite: boolean): Promise<void> {
  await db.runAsync(
    'UPDATE verso_entries SET is_favorite = ? WHERE id = ?',
    isFavorite ? 1 : 0,
    id
  );
}

export async function deleteVersoEntry(id: number): Promise<void> {
  await db.runAsync('DELETE FROM verso_entries WHERE id = ?', id);
}

// Custom templates
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

// Paradox
export async function addParadoxEntry(content: string, prompt?: string): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO paradox_entries (content, prompt, created_at) VALUES (?, ?, ?)',
    content,
    prompt ?? null,
    Math.floor(Date.now() / 1000)
  );
  return result.lastInsertRowId;
}

export async function getParadoxEntries(): Promise<ParadoxEntry[]> {
  return db.getAllAsync<ParadoxEntry>(
    'SELECT * FROM paradox_entries ORDER BY created_at DESC'
  );
}

export async function deleteParadoxEntry(id: number): Promise<void> {
  await db.runAsync('DELETE FROM paradox_entries WHERE id = ?', id);
}

// Config
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

// Export
export async function exportAllData(): Promise<string> {
  const tideEntries = await getTideEntries();
  const driftEntries = await getDriftEntries();
  const versoEntries = await getVersoEntries();
  const paradoxEntries = await getParadoxEntries();

  const fmt = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });

  let out = `SWELL — Export ${new Date().toLocaleDateString()}\n\n`;

  out += `=== DRIFT ===\n`;
  for (const e of driftEntries) {
    out += `\n[${fmt(e.created_at)}] ${e.tag}\n${e.content}\n`;
  }

  out += `\n\n=== TIDE ===\n`;
  for (const e of tideEntries) {
    out += `\n[${fmt(e.created_at)}] ${e.state}`;
    if (e.note) out += `\n${e.note}`;
    out += '\n';
  }

  out += `\n\n=== VERSO ===\n`;
  for (const e of versoEntries) {
    out += `\n[${fmt(e.created_at)}]${e.is_favorite ? ' ★' : ''}\n${e.completed_line}\n`;
  }

  out += `\n\n=== PARADOX ===\n`;
  for (const e of paradoxEntries) {
    out += `\n[${fmt(e.created_at)}]${e.prompt ? ` (${e.prompt})` : ''}\n${e.content}\n`;
  }

  return out;
}

// Terrain
export type TerrainEntry = {
  id: number;
  cadence: string | null;
  exposure: string | null;
  traction: string | null;
  resonance: string | null;
  condition_title: string | null;
  created_at: number;
};

type TerrainInput = Omit<TerrainEntry, 'id' | 'created_at'>;

export async function addTerrainEntry(input: TerrainInput): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO terrain_entries (cadence, exposure, traction, resonance, condition_title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    input.cadence,
    input.exposure,
    input.traction,
    input.resonance,
    input.condition_title,
    Math.floor(Date.now() / 1000)
  );
  return result.lastInsertRowId;
}

export async function getTerrainEntries(): Promise<TerrainEntry[]> {
  return db.getAllAsync<TerrainEntry>(
    'SELECT * FROM terrain_entries ORDER BY created_at DESC'
  );
}

export async function deleteTerrainEntry(id: number): Promise<void> {
  await db.runAsync('DELETE FROM terrain_entries WHERE id = ?', id);
}

// Constellation
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

type ConstellationInput = Omit<ConstellationEntry, 'id' | 'created_at'>;

export async function addConstellationEntry(input: ConstellationInput): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO constellation_entries (name, tie_kind, nearness, reciprocity, tension, circle, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    input.name,
    input.tie_kind,
    input.nearness,
    input.reciprocity,
    input.tension,
    input.circle,
    Math.floor(Date.now() / 1000)
  );
  return result.lastInsertRowId;
}

export async function getConstellationEntries(): Promise<ConstellationEntry[]> {
  return db.getAllAsync<ConstellationEntry>(
    'SELECT * FROM constellation_entries ORDER BY created_at DESC'
  );
}

export async function deleteConstellationEntry(id: number): Promise<void> {
  await db.runAsync('DELETE FROM constellation_entries WHERE id = ?', id);
}

// Clear all
export async function clearAllData(): Promise<void> {
  await db.execAsync(`
    DELETE FROM tide_entries;
    DELETE FROM drift_entries;
    DELETE FROM verso_entries;
    DELETE FROM paradox_entries;
    DELETE FROM custom_templates;
    DELETE FROM terrain_entries;
    DELETE FROM constellation_entries;
  `);
}
