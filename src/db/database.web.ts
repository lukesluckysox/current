// Web implementation — localStorage-backed, mirrors the native expo-sqlite API exactly.
// Metro picks this file automatically on web builds.

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

// ─── Storage helpers ─────────────────────────────────────────────────────────

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
    return JSON.parse(localStorage.getItem('swell_config') ?? '{}');
  } catch {
    return {};
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  const drift = load<DriftEntry>('swell_drift');
  if (drift.length === 0) {
    await seedData();
  }
}

async function seedData(): Promise<void> {
  const n = now();
  const d = 86400;

  save<DriftEntry>('swell_drift', [
    { id: 1, content: 'the best ideas arrive when you\'re doing something else', tag: 'thought', created_at: n - d * 4 },
    { id: 2, content: 'a sentence written in salt', tag: 'verse', created_at: n - d * 3 },
    { id: 3, content: 'ambition is just impatience dressed up', tag: 'paradox', created_at: n - d * 2 },
    { id: 4, content: 'what if slow is the whole point', tag: 'thought', created_at: n - d },
    { id: 5, content: 'everything interesting happens at the edges', tag: 'line', created_at: n - Math.floor(d * 0.5) },
  ]);

  save<TideEntry>('swell_tide', [
    { id: 1, state: 'glass water', note: 'finally', created_at: n - d * 5 },
    { id: 2, state: 'building chop', note: 'deadline tomorrow', created_at: n - d * 3 },
    { id: 3, state: 'offshore winds', note: null, created_at: n - d * 2 },
    { id: 4, state: 'golden hour calm', note: 'sunday feeling', created_at: n - d },
    { id: 5, state: 'low tide', note: null, created_at: n - Math.floor(d * 0.3) },
  ]);

  save<VersoEntry>('swell_verso', [
    { id: 1, template: 'The ocean is a _ for the _ mind.', completed_line: 'The ocean is a mirror for the restless mind.', is_favorite: 1, created_at: n - d * 4 },
    { id: 2, template: 'Coffee is _ disguised as _.', completed_line: 'Coffee is urgency disguised as ritual.', is_favorite: 0, created_at: n - d * 2 },
    { id: 3, template: '_ is the price of _.', completed_line: 'Clarity is the price of solitude.', is_favorite: 1, created_at: n - d },
  ]);

  save<ParadoxEntry>('swell_paradox', [
    { id: 1, content: 'The more clearly you see your destination,\nthe less certain you become\nthat you want to arrive.', prompt: 'ambition', created_at: n - d * 5 },
    { id: 2, content: 'Freedom is the only cage\nthat requires your consent.', prompt: 'freedom', created_at: n - d * 3 },
    { id: 3, content: 'Silence speaks most clearly\nwhen no one is listening.', prompt: 'silence', created_at: n - d },
  ]);
}

// ─── Tide ─────────────────────────────────────────────────────────────────────

export async function addTideEntry(state: string, note: string | null): Promise<number> {
  const items = load<TideEntry>('swell_tide');
  const id = nextId(items);
  items.unshift({ id, state, note, created_at: now() });
  save('swell_tide', items);
  return id;
}

export async function getTideEntries(): Promise<TideEntry[]> {
  return load<TideEntry>('swell_tide').sort((a, b) => b.created_at - a.created_at);
}

export async function deleteTideEntry(id: number): Promise<void> {
  save('swell_tide', load<TideEntry>('swell_tide').filter((e) => e.id !== id));
}

// ─── Drift ────────────────────────────────────────────────────────────────────

export async function addDriftEntry(content: string, tag: string): Promise<number> {
  const items = load<DriftEntry>('swell_drift');
  const id = nextId(items);
  items.unshift({ id, content, tag, created_at: now() });
  save('swell_drift', items);
  return id;
}

export async function getDriftEntries(): Promise<DriftEntry[]> {
  return load<DriftEntry>('swell_drift').sort((a, b) => b.created_at - a.created_at);
}

export async function getRandomDriftEntry(): Promise<DriftEntry | null> {
  const items = load<DriftEntry>('swell_drift');
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export async function deleteDriftEntry(id: number): Promise<void> {
  save('swell_drift', load<DriftEntry>('swell_drift').filter((e) => e.id !== id));
}

// ─── Verso ────────────────────────────────────────────────────────────────────

export async function addVersoEntry(template: string, completedLine: string): Promise<number> {
  const items = load<VersoEntry>('swell_verso');
  const id = nextId(items);
  items.unshift({ id, template, completed_line: completedLine, is_favorite: 0, created_at: now() });
  save('swell_verso', items);
  return id;
}

export async function getVersoEntries(): Promise<VersoEntry[]> {
  return load<VersoEntry>('swell_verso').sort((a, b) => {
    if (b.is_favorite !== a.is_favorite) return b.is_favorite - a.is_favorite;
    return b.created_at - a.created_at;
  });
}

export async function toggleVersoFavorite(id: number, isFavorite: boolean): Promise<void> {
  const items = load<VersoEntry>('swell_verso').map((e) =>
    e.id === id ? { ...e, is_favorite: isFavorite ? 1 : 0 } : e
  );
  save('swell_verso', items);
}

export async function deleteVersoEntry(id: number): Promise<void> {
  save('swell_verso', load<VersoEntry>('swell_verso').filter((e) => e.id !== id));
}

// ─── Custom templates ─────────────────────────────────────────────────────────

export async function addCustomTemplate(template: string): Promise<void> {
  const items = load<{ id: number; template: string }>('swell_templates');
  items.push({ id: nextId(items), template });
  save('swell_templates', items);
}

export async function getCustomTemplates(): Promise<Array<{ id: number; template: string }>> {
  return load<{ id: number; template: string }>('swell_templates');
}

// ─── Paradox ──────────────────────────────────────────────────────────────────

export async function addParadoxEntry(content: string, prompt?: string): Promise<number> {
  const items = load<ParadoxEntry>('swell_paradox');
  const id = nextId(items);
  items.unshift({ id, content, prompt: prompt ?? null, created_at: now() });
  save('swell_paradox', items);
  return id;
}

export async function getParadoxEntries(): Promise<ParadoxEntry[]> {
  return load<ParadoxEntry>('swell_paradox').sort((a, b) => b.created_at - a.created_at);
}

export async function deleteParadoxEntry(id: number): Promise<void> {
  save('swell_paradox', load<ParadoxEntry>('swell_paradox').filter((e) => e.id !== id));
}

// ─── Terrain ──────────────────────────────────────────────────────────────────

type TerrainInput = Omit<TerrainEntry, 'id' | 'created_at'>;

export async function addTerrainEntry(input: TerrainInput): Promise<number> {
  const items = load<TerrainEntry>('swell_terrain');
  const id = nextId(items);
  items.unshift({ id, ...input, created_at: now() });
  save('swell_terrain', items);
  return id;
}

export async function getTerrainEntries(): Promise<TerrainEntry[]> {
  return load<TerrainEntry>('swell_terrain').sort((a, b) => b.created_at - a.created_at);
}

export async function deleteTerrainEntry(id: number): Promise<void> {
  save('swell_terrain', load<TerrainEntry>('swell_terrain').filter((e) => e.id !== id));
}

// ─── Constellation ───────────────────────────────────────────────────────────

type ConstellationInput = Omit<ConstellationEntry, 'id' | 'created_at'>;

export async function addConstellationEntry(input: ConstellationInput): Promise<number> {
  const items = load<ConstellationEntry>('swell_constellation');
  const id = nextId(items);
  items.unshift({ id, ...input, created_at: now() });
  save('swell_constellation', items);
  return id;
}

export async function getConstellationEntries(): Promise<ConstellationEntry[]> {
  return load<ConstellationEntry>('swell_constellation').sort((a, b) => b.created_at - a.created_at);
}

export async function deleteConstellationEntry(id: number): Promise<void> {
  save('swell_constellation', load<ConstellationEntry>('swell_constellation').filter((e) => e.id !== id));
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getConfig(key: string): Promise<string | null> {
  return loadConfig()[key] ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const config = loadConfig();
  config[key] = value;
  localStorage.setItem('swell_config', JSON.stringify(config));
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportAllData(): Promise<string> {
  const [tide, drift, verso, paradox] = await Promise.all([
    getTideEntries(),
    getDriftEntries(),
    getVersoEntries(),
    getParadoxEntries(),
  ]);

  const fmt = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  let out = `SWELL — Export ${new Date().toLocaleDateString()}\n\n`;

  out += `=== DRIFT ===\n`;
  for (const e of drift) out += `\n[${fmt(e.created_at)}] ${e.tag}\n${e.content}\n`;

  out += `\n\n=== TIDE ===\n`;
  for (const e of tide) {
    out += `\n[${fmt(e.created_at)}] ${e.state}`;
    if (e.note) out += `\n${e.note}`;
    out += '\n';
  }

  out += `\n\n=== VERSO ===\n`;
  for (const e of verso) out += `\n[${fmt(e.created_at)}]${e.is_favorite ? ' ★' : ''}\n${e.completed_line}\n`;

  out += `\n\n=== PARADOX ===\n`;
  for (const e of paradox) out += `\n[${fmt(e.created_at)}]${e.prompt ? ` (${e.prompt})` : ''}\n${e.content}\n`;

  return out;
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  ['swell_drift', 'swell_tide', 'swell_verso', 'swell_paradox',
   'swell_templates', 'swell_terrain', 'swell_constellation'].forEach((k) =>
    localStorage.removeItem(k)
  );
}
