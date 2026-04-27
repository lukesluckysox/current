// Thin client wrapper around POST /api/generate.
//
// In production the Expo web bundle is served by the same Node process that
// owns /api, so a relative path works. For local Expo dev (where Metro serves
// the JS bundle on a different port from the API), set EXPO_PUBLIC_API_BASE
// at build time, e.g. EXPO_PUBLIC_API_BASE=http://localhost:3000.

export type GenerateBreak = 'aphorism' | 'paradox' | 'contradiction';

export type GenerateError =
  | { kind: 'timeout' }
  | { kind: 'unavailable' }
  | { kind: 'rate_limited' }
  | { kind: 'bad_request' }
  | { kind: 'network' }
  | { kind: 'empty' };

const TIMEOUT_MS = 8000;

function apiBase(): string {
  // EXPO_PUBLIC_* is the only env shape Expo exposes to the client bundle.
  // Defaults to '' so calls go to the same origin (Express in production).
  const fromEnv =
    typeof process !== 'undefined' && process.env && (process.env.EXPO_PUBLIC_API_BASE as string | undefined);
  return (fromEnv || '').replace(/\/+$/, '');
}

export async function generateLine(
  type: GenerateBreak,
  seed?: string
): Promise<{ ok: true; line: string } | { ok: false; error: GenerateError }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, seed: seed?.slice(0, 280) ?? '' }),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 429) return { ok: false, error: { kind: 'rate_limited' } };
      if (res.status === 503) return { ok: false, error: { kind: 'unavailable' } };
      if (res.status === 400) return { ok: false, error: { kind: 'bad_request' } };
      if (res.status === 504) return { ok: false, error: { kind: 'timeout' } };
      return { ok: false, error: { kind: 'network' } };
    }
    const data = (await res.json()) as { line?: string };
    const line = (data.line || '').trim();
    if (!line) return { ok: false, error: { kind: 'empty' } };
    return { ok: true, line };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { ok: false, error: { kind: 'timeout' } };
    }
    return { ok: false, error: { kind: 'network' } };
  } finally {
    clearTimeout(timer);
  }
}
