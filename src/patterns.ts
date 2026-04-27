// Pattern memory for Current.
//
// Lightweight, pure functions over the user's saved Lines (and the active
// fragment) that detect recurring themes, words, and break runs. The output
// is consumed by:
//   - the generate-context packet sent to /api/generate
//   - the forecast / depth stack ("returning currents")
//   - the "return to this" surface when a current re-appears
//
// Everything here is in-memory. No new persistence. No PII leaves the client
// without going through /api/generate's existing context channel.

import type { Line, LineMode } from './db/database';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'is', 'it', 'its',
  'i', 'you', 'we', 'my', 'your', 'this', 'that', 'with', 'for', 'as', 'at',
  'be', 'are', 'was', 'were', 'been', 'so', 'if', 'than', 'then', 'just',
  'when', 'where', 'how', 'what', 'who', 'why', 'do', 'does', 'did', 'have',
  'has', 'had', 'into', 'about', 'from', 'by', 'me', 'us', 'our', 'their',
  'they', 'them', 'he', 'she', 'his', 'her', 'will', 'would', 'should', 'could',
  'can', 'cannot', 'not', 'no', 'yes', 'all', 'any', 'some', 'most',
  'one', 'two', 'three', 'still', 'only', 'every', 'each', 'much', 'many',
  'very', 'really', 'quite', 'now', 'here', 'there', 'over', 'under', 'out',
  'up', 'down', 'off', 'after', 'before', 'again', 'always', 'never',
  'thing', 'things', 'something', 'someone', 'nothing', 'nobody',
]);

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

// ─── Lexicon ────────────────────────────────────────────────────────────────

export type LexiconEntry = { word: string; count: number };

/**
 * Build a personal lexicon from the user's saved lines.
 * Words shorter than 4 chars or in the stopword list are dropped.
 * The same word appearing multiple times in one line is counted once per
 * line — so the lexicon reflects breadth, not just one verbose line.
 */
export function buildLexicon(lines: Line[], limit = 12): LexiconEntry[] {
  const counts = new Map<string, number>();
  for (const l of lines) {
    const seen = new Set<string>();
    for (const w of tokenize(l.content)) seen.add(w);
    for (const w of seen) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

// ─── Currents (returning themes) ────────────────────────────────────────────

export type CurrentSummary = {
  /** human-readable summary, e.g. "freedom × control" or "tide · low tide" */
  label: string;
  count: number;
  kind: 'word' | 'tide' | 'terrain' | 'constellation' | 'mode';
  value: string;
  /** newest matching line, for "return to this" */
  latest: Line;
  /** oldest matching line, for "this current first appeared" */
  earliest: Line;
};

function tally<T extends string | null | undefined>(
  values: Iterable<T>,
): Array<{ key: NonNullable<T>; count: number }> {
  const m = new Map<NonNullable<T>, number>();
  for (const v of values) {
    if (v == null || v === '') continue;
    const key = v as NonNullable<T>;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

/**
 * Returning currents: tags or words that show up across multiple saved lines.
 * Sorted by count, then by recency. Cap at `limit`.
 */
export function findCurrents(lines: Line[], limit = 5): CurrentSummary[] {
  if (lines.length < 3) return [];
  const out: CurrentSummary[] = [];

  const wantThree = (key: string, kind: CurrentSummary['kind'], matcher: (l: Line) => boolean) => {
    const matched = lines.filter(matcher);
    if (matched.length < 2) return null;
    const sorted = [...matched].sort((a, b) => b.created_at - a.created_at);
    return {
      label: kind === 'word' ? key : `${kind} · ${key}`,
      count: matched.length,
      kind,
      value: key,
      latest: sorted[0],
      earliest: sorted[sorted.length - 1],
    } satisfies CurrentSummary;
  };

  for (const t of tally(lines.map((l) => l.tide)).slice(0, 3)) {
    if (t.count < 2) break;
    const c = wantThree(t.key, 'tide', (l) => l.tide === t.key);
    if (c) out.push(c);
  }
  for (const t of tally(lines.map((l) => l.terrain)).slice(0, 3)) {
    if (t.count < 2) break;
    const c = wantThree(t.key, 'terrain', (l) => l.terrain === t.key);
    if (c) out.push(c);
  }
  for (const t of tally(lines.map((l) => l.constellation)).slice(0, 3)) {
    if (t.count < 2) break;
    const c = wantThree(t.key, 'constellation', (l) => l.constellation === t.key);
    if (c) out.push(c);
  }

  // Word currents from the lexicon — only the strongest few.
  const lex = buildLexicon(lines, 6);
  for (const { word, count } of lex) {
    if (count < 3) continue;
    const re = new RegExp(`\\b${word}\\b`, 'i');
    const c = wantThree(word, 'word', (l) => re.test(l.content));
    if (c) out.push(c);
  }

  // Sort: count desc, recency desc.
  out.sort((a, b) => b.count - a.count || b.latest.created_at - a.latest.created_at);
  // De-dupe near-duplicates by value.
  const seen = new Set<string>();
  const dedup: CurrentSummary[] = [];
  for (const c of out) {
    const k = `${c.kind}:${c.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(c);
    if (dedup.length >= limit) break;
  }
  return dedup;
}

// ─── Dominant break ─────────────────────────────────────────────────────────

export function dominantBreak(lines: Line[]): LineMode | null {
  if (lines.length < 3) return null;
  const recent = [...lines]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 12)
    .map((l) => l.mode)
    .filter((m): m is LineMode => m !== 'fragment');
  if (recent.length < 2) return null;
  const counts = tally(recent);
  return counts[0]?.key ?? null;
}

// ─── Echo: fragment matches an old current ──────────────────────────────────

export type Echo = {
  current: CurrentSummary;
  /** the echoed older line worth surfacing */
  line: Line;
};

/** Detect whether an active fragment touches a returning current. */
export function detectEcho(
  fragmentText: string,
  fragmentTags: { tide?: string | null; terrain?: string | null; constellation?: string | null },
  currents: CurrentSummary[],
  lines: Line[],
): Echo | null {
  if (currents.length === 0) return null;

  for (const c of currents) {
    if (c.kind === 'tide' && fragmentTags.tide && fragmentTags.tide === c.value) {
      return { current: c, line: c.latest };
    }
    if (c.kind === 'terrain' && fragmentTags.terrain && fragmentTags.terrain === c.value) {
      return { current: c, line: c.latest };
    }
    if (c.kind === 'constellation' && fragmentTags.constellation && fragmentTags.constellation === c.value) {
      return { current: c, line: c.latest };
    }
  }

  // Word-level echo.
  const tokens = new Set(tokenize(fragmentText));
  for (const c of currents) {
    if (c.kind !== 'word') continue;
    if (tokens.has(c.value)) {
      // Prefer an *older* line for the echo: this is the "return to this".
      const sorted = lines
        .filter((l) => new RegExp(`\\b${c.value}\\b`, 'i').test(l.content))
        .sort((a, b) => a.created_at - b.created_at);
      const candidate = sorted[0] ?? c.latest;
      return { current: c, line: candidate };
    }
  }
  return null;
}

// ─── Style hints store (resonance feedback) ─────────────────────────────────
//
// Stored client-side only via the existing config (web localStorage / sqlite
// `config` key/value). We keep this opt-in and tiny — at most a small array of
// "held" / "wanted" tokens which the prompt refers to without quoting.

export type ResonanceVote = 'held' | 'missed' | 'too-soft' | 'too-clean' | 'too-obvious' | 'closer';

export type StyleHints = {
  held: string[];      // tokens the user kept ("closer", "held")
  wanted: string[];    // negative cues ("less soft", "less obvious")
};

export function emptyStyleHints(): StyleHints {
  return { held: [], wanted: [] };
}

/** Update style hints from a feedback vote on a generated line. Capped sizes. */
export function applyFeedback(
  hints: StyleHints,
  vote: ResonanceVote,
  line: string,
): StyleHints {
  const next: StyleHints = {
    held: hints.held.slice(),
    wanted: hints.wanted.slice(),
  };
  const tokens = tokenize(line).slice(0, 4);
  if (vote === 'held' || vote === 'closer') {
    for (const t of tokens) {
      if (!next.held.includes(t)) next.held.unshift(t);
    }
  } else if (vote === 'missed' || vote === 'too-soft') {
    if (!next.wanted.includes('sharper')) next.wanted.unshift('sharper');
    if (vote === 'too-soft' && !next.wanted.includes('less soft')) next.wanted.unshift('less soft');
  } else if (vote === 'too-clean') {
    if (!next.wanted.includes('stranger')) next.wanted.unshift('stranger');
  } else if (vote === 'too-obvious') {
    if (!next.wanted.includes('less obvious')) next.wanted.unshift('less obvious');
  }
  next.held = next.held.slice(0, 8);
  next.wanted = next.wanted.slice(0, 4);
  return next;
}

// ─── Local break reader (rule-based, instant) ──────────────────────────────

export type BreakReadResult = {
  type: 'aphorism' | 'paradox' | 'contradiction' | 'aside';
  reason: string;
  hint?: string;
};

export function readBreakLocal(text: string): BreakReadResult | null {
  const t = (text || '').trim();
  if (t.length < 6) return null;
  const lower = t.toLowerCase();

  if (
    /\bi (say|told|promise|swear|claim|wanted|love|hate|miss)\b/i.test(lower) &&
    /\b(but|and yet|then)\b/.test(lower)
  ) {
    return {
      type: 'contradiction',
      reason: 'belief and behavior are pulling against each other.',
      hint: 'name the small action that gives you away.',
    };
  }
  if (/\bthe more\b.*\bthe (less|further|harder|softer)\b/i.test(lower)) {
    return {
      type: 'paradox',
      reason: 'a hinge has formed — let the two truths stay tense.',
      hint: 'do not resolve it.',
    };
  }
  if (/\b(and yet|even as|while|though|despite)\b/i.test(lower)) {
    return {
      type: 'paradox',
      reason: 'two truths are alive here — paradox holds them.',
    };
  }
  if (/\b(say|told|promised|swore|claim)\b.*\b(but|yet)\b/i.test(lower)) {
    return {
      type: 'contradiction',
      reason: 'a gap between words and behavior.',
    };
  }

  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 4 && wordCount <= 14 && !/[?]/.test(lower)) {
    return {
      type: 'aphorism',
      reason: 'short and declarative — sharpen into one portable line.',
    };
  }
  return null;
}

// ─── Restraint signal ──────────────────────────────────────────────────────

export type RestraintSignal = {
  reason: 'too-short' | 'too-thin' | 'no-anchor';
  message: string;
};

/**
 * Suggest "stay with this one" when a fragment is so thin that shaping is
 * premature. Returns null when the fragment is workable.
 */
export function restraint(text: string): RestraintSignal | null {
  const t = (text || '').trim();
  if (t.length === 0) return null;
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2) {
    return {
      reason: 'too-short',
      message: 'still forming. stay with this one.',
    };
  }
  if (wordCount <= 4 && !/[.!?]/.test(t)) {
    return {
      reason: 'too-thin',
      message: 'a few more words before you shape it.',
    };
  }
  return null;
}
