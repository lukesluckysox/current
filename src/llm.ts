// Thin client wrapper around the Current server API.
//
// In production the Expo web bundle is served by the same Node process that
// owns /api, so a relative path works. For local Expo dev (where Metro serves
// the JS bundle on a different port from the API), set EXPO_PUBLIC_API_BASE
// at build time, e.g. EXPO_PUBLIC_API_BASE=http://localhost:3000.

export type GenerateBreak = 'aphorism' | 'paradox' | 'contradiction' | 'aside';
export type EditOp = 'clearer' | 'sharper' | 'stranger';

export type GenerateError =
  | { kind: 'timeout' }
  | { kind: 'unavailable' }
  | { kind: 'rate_limited' }
  | { kind: 'bad_request' }
  | { kind: 'network' }
  | { kind: 'empty' };

// Compact context packet sent with /api/generate. Caller is responsible for
// truncating / anonymising — server will also drop oversized fields.
export type GenerateContext = {
  tide?: string | null;
  terrain?: string | null;
  constellation?: string | null;
  lexicon?: string[];
  currents?: string[];
  dominantBreak?: string | null;
  styleHints?: string[];
};

const TIMEOUT_MS = 8000;

function apiBase(): string {
  const fromEnv =
    typeof process !== 'undefined' && process.env && (process.env.EXPO_PUBLIC_API_BASE as string | undefined);
  return (fromEnv || '').replace(/\/+$/, '');
}

async function call<T>(
  pathname: string,
  body: object,
): Promise<{ ok: true; data: T } | { ok: false; error: GenerateError }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 429) return { ok: false, error: { kind: 'rate_limited' } };
      if (res.status === 503) return { ok: false, error: { kind: 'unavailable' } };
      if (res.status === 400) return { ok: false, error: { kind: 'bad_request' } };
      if (res.status === 504) return { ok: false, error: { kind: 'timeout' } };
      return { ok: false, error: { kind: 'network' } };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { ok: false, error: { kind: 'timeout' } };
    }
    return { ok: false, error: { kind: 'network' } };
  } finally {
    clearTimeout(timer);
  }
}

// generateLine: behavior is determined by whether `seed` has content.
//   empty seed  — fresh line in the chosen mode ("inspire" mode).
//   filled seed — twist the speaker's own words into the chosen mode.
// The server makes the same decision; no extra param needed.
export async function generateLine(
  type: GenerateBreak,
  seed?: string,
  context?: GenerateContext,
): Promise<{ ok: true; line: string } | { ok: false; error: GenerateError }> {
  const result = await call<{ line?: string }>('/api/generate', {
    type,
    seed: seed?.slice(0, 280) ?? '',
    context: context ?? null,
  });
  if (!result.ok) return result;
  const line = (result.data.line || '').trim();
  if (!line) return { ok: false, error: { kind: 'empty' } };
  return { ok: true, line };
}

export async function editLine(
  op: EditOp,
  line: string,
  type?: GenerateBreak,
): Promise<{ ok: true; line: string } | { ok: false; error: GenerateError }> {
  if (!line.trim()) return { ok: false, error: { kind: 'bad_request' } };
  const result = await call<{ line?: string }>('/api/edit', {
    op,
    line: line.slice(0, 280),
    type,
  });
  if (!result.ok) return result;
  const out = (result.data.line || '').trim();
  if (!out) return { ok: false, error: { kind: 'empty' } };
  return { ok: true, line: out };
}

export type CompleteBoard =
  | 'confession' | 'image' | 'question' | 'memory'
  | 'contradiction' | 'threshold' | 'return';

export async function generateBreaks(
  board: CompleteBoard,
  count = 4,
  context?: GenerateContext,
): Promise<{ ok: true; breaks: string[] } | { ok: false; error: GenerateError }> {
  const result = await call<{ breaks?: string[] }>('/api/generate-breaks', {
    board,
    count,
    context: context ?? null,
  });
  if (!result.ok) return result;
  const breaks = (result.data.breaks || [])
    .filter((b) => typeof b === 'string')
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  if (breaks.length === 0) return { ok: false, error: { kind: 'empty' } };
  return { ok: true, breaks };
}

// ─── Stillwater anchor ──────────────────────────────────────────────────────
//
// One short grounding line for a speaker who feels pulled. Three pull states:
//   'under'    — being pulled under (absorbing the room, agreeing in advance)
//   'holding'  — trying to hold the line
//   'against'  — kicking against the current (still feeding what they reject)

export type AnchorPull = 'under' | 'holding' | 'against';

export async function generateAnchor(
  pull: AnchorPull,
  custom?: string,
): Promise<{ ok: true; line: string } | { ok: false; error: GenerateError }> {
  const result = await call<{ line?: string }>('/api/anchor', {
    pull,
    custom: custom?.slice(0, 280) ?? '',
  });
  if (!result.ok) return result;
  const line = (result.data.line || '').trim();
  if (!line) return { ok: false, error: { kind: 'empty' } };
  return { ok: true, line };
}

export type WhyBreakResult = {
  type: GenerateBreak;
  reason: string;
  source?: 'rule' | 'default';
};

export async function readBreak(
  text: string,
): Promise<{ ok: true; data: WhyBreakResult } | { ok: false; error: GenerateError }> {
  if (!text.trim()) return { ok: false, error: { kind: 'bad_request' } };
  const result = await call<WhyBreakResult>('/api/why-break', { text: text.slice(0, 280) });
  if (!result.ok) return result;
  return { ok: true, data: result.data };
}
