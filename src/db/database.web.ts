// Web implementation — localStorage-backed, mirrors the native Lines API.
// Metro picks this file automatically on web builds.

export type LineMode =
  | 'fragment'
  | 'complete'
  | 'paradox'
  | 'distill'
  | 'aphorism'
  | 'invert';

export type Line = {
  id: number;
  content: string;
  mode: LineMode;
  template: string | null;
  tide: string | null;
  terrain: string | null;
  constellation: string | null;
  topic: string | null;
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

// ─── Storage helpers ─────────────────────────────────────────────────────────

const KEY_LINES = 'swell_lines';
const KEY_TEMPLATES = 'swell_templates';
const KEY_CONFIG = 'swell_config';
const KEY_MIGRATED = 'swell_lines_migrated_v1';

function load<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]');
  } catch {
    return [];
  }
}

function save<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function nextId<T extends { id: number }>(items: T[]): number {
  return items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function loadConfig(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY_CONFIG) ?? '{}');
  } catch {
    return {};
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  migrateLegacyToLines();
  const lines = load<Line>(KEY_LINES);
  if (lines.length === 0) {
    seedLines();
  }
}

function migrateLegacyToLines(): void {
  if (localStorage.getItem(KEY_MIGRATED) === 'true') return;

  const existing = load<Line>(KEY_LINES);
  const out: Line[] = [...existing];
  let id = nextId(out);

  type LegacyDrift = { id: number; content: string; tag: string; created_at: number };
  type LegacyVerso = { id: number; template: string; completed_line: string; is_favorite: number; created_at: number };
  type LegacyParadox = { id: number; content: string; prompt: string | null; created_at: number };

  for (const e of load<LegacyDrift>('swell_drift')) {
    out.push({
      id: id++,
      content: e.content,
      mode: 'fragment',
      template: null,
      tide: null,
      terrain: null,
      constellation: null,
      topic: null,
      is_favorite: 0,
      created_at: e.created_at,
    });
  }
  for (const e of load<LegacyVerso>('swell_verso')) {
    out.push({
      id: id++,
      content: e.completed_line,
      mode: 'complete',
      template: e.template,
      tide: null,
      terrain: null,
      constellation: null,
      topic: null,
      is_favorite: e.is_favorite,
      created_at: e.created_at,
    });
  }
  for (const e of load<LegacyParadox>('swell_paradox')) {
    out.push({
      id: id++,
      content: e.content,
      mode: 'paradox',
      template: null,
      tide: null,
      terrain: null,
      constellation: null,
      topic: e.prompt,
      is_favorite: 0,
      created_at: e.created_at,
    });
  }

  save(KEY_LINES, out);
  localStorage.setItem(KEY_MIGRATED, 'true');
}

function seedLines(): void {
  const n = now();
  const d = 86400;
  save<Line>(KEY_LINES, [
    { id: 1, content: "the best ideas arrive when you're doing something else", mode: 'fragment', template: null, tide: 'glass water', terrain: null, constellation: null, topic: null, is_favorite: 0, created_at: n - d * 4 },
    { id: 2, content: 'a sentence written in salt', mode: 'fragment', template: null, tide: null, terrain: 'still', constellation: null, topic: null, is_favorite: 0, created_at: n - d * 3 },
    { id: 3, content: 'ambition is just impatience dressed up', mode: 'paradox', template: null, tide: null, terrain: null, constellation: null, topic: null, is_favorite: 0, created_at: n - d * 2 },
    { id: 4, content: 'what if slow is the whole point', mode: 'fragment', template: null, tide: 'low tide', terrain: null, constellation: null, topic: null, is_favorite: 0, created_at: n - d },
    { id: 5, content: 'everything interesting happens at the edges', mode: 'fragment', template: null, tide: null, terrain: null, constellation: null, topic: null, is_favorite: 0, created_at: n - Math.floor(d * 0.5) },
    { id: 6, content: 'The ocean is a mirror for the restless mind.', mode: 'complete', template: 'The ocean is a _ for the _ mind.', tide: null, terrain: null, constellation: null, topic: null, is_favorite: 1, created_at: n - d * 4 },
    { id: 7, content: 'Clarity is the price of solitude.', mode: 'complete', template: '_ is the price of _.', tide: null, terrain: null, constellation: null, topic: null, is_favorite: 1, created_at: n - d },
  ]);
}

// ─── Lines API ───────────────────────────────────────────────────────────────

export async function addLine(input: LineInput): Promise<number> {
  const items = load<Line>(KEY_LINES);
  const id = nextId(items);
  items.unshift({
    id,
    content: input.content,
    mode: input.mode ?? 'fragment',
    template: input.template ?? null,
    tide: input.tide ?? null,
    terrain: input.terrain ?? null,
    constellation: input.constellation ?? null,
    topic: input.topic ?? null,
    is_favorite: 0,
    created_at: now(),
  });
  save(KEY_LINES, items);
  return id;
}

export async function getLines(filter?: { mode?: LineMode }): Promise<Line[]> {
  const items = load<Line>(KEY_LINES).slice();
  const filtered = filter?.mode ? items.filter((l) => l.mode === filter.mode) : items;
  return filtered.sort((a, b) => {
    if (b.is_favorite !== a.is_favorite) return b.is_favorite - a.is_favorite;
    return b.created_at - a.created_at;
  });
}

export async function getRandomLine(): Promise<Line | null> {
  const items = load<Line>(KEY_LINES);
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export async function toggleLineFavorite(id: number, isFavorite: boolean): Promise<void> {
  const items = load<Line>(KEY_LINES).map((e) =>
    e.id === id ? { ...e, is_favorite: isFavorite ? 1 : 0 } : e
  );
  save(KEY_LINES, items);
}

export async function deleteLine(id: number): Promise<void> {
  save(KEY_LINES, load<Line>(KEY_LINES).filter((e) => e.id !== id));
}

// ─── Custom templates ────────────────────────────────────────────────────────

export async function addCustomTemplate(template: string): Promise<void> {
  const items = load<{ id: number; template: string }>(KEY_TEMPLATES);
  items.push({ id: nextId(items), template });
  save(KEY_TEMPLATES, items);
}

export async function getCustomTemplates(): Promise<Array<{ id: number; template: string }>> {
  return load<{ id: number; template: string }>(KEY_TEMPLATES);
}

// ─── Config ──────────────────────────────────────────────────────────────────

export async function getConfig(key: string): Promise<string | null> {
  return loadConfig()[key] ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const config = loadConfig();
  config[key] = value;
  localStorage.setItem(KEY_CONFIG, JSON.stringify(config));
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
  [
    KEY_LINES, KEY_TEMPLATES,
    'swell_drift', 'swell_tide', 'swell_verso', 'swell_paradox',
    'swell_terrain', 'swell_constellation',
  ].forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem(KEY_MIGRATED);
}
