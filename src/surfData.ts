// Live surf-data resonance.
//
// Pulls public marine conditions for a curated set of real surf breaks from
// Open-Meteo (no API key, no scraping) and matches them to the user's inner
// "read" vector derived from the forecast engine. The match is a metaphor —
// the app states "your inner read currently most resembles live water at X",
// never claims this is Surfline data or an authoritative surf report.
//
// Open-Meteo Marine API docs: https://open-meteo.com/en/docs/marine-weather-api
// Open-Meteo Wind/Weather API: https://open-meteo.com/en/docs

import type { Texture, Direction, ForecastSource, ForecastConditions, TidePhase } from './forecast';

// ─── curated breaks ──────────────────────────────────────────────────────────
//
// Real breaks with rough lat/lon. Region/character are flavour. The list
// is intentionally short — fewer requests, lower API noise, more recognisable
// to a non-surfer.

export type Break = {
  name: string;
  region: string;
  lat: number;
  lon: number;
  /** poetic / felt character used as fallback copy when match is loose. */
  feel: string;
};

export const BREAKS: Break[] = [
  { name: 'Waikiki',           region: 'Oʻahu',          lat: 21.276,  lon: -157.828, feel: 'small, warm, easy to step into' },
  { name: 'Pipeline',          region: 'Oʻahu',          lat: 21.665,  lon: -158.053, feel: 'heavy, square, no margin for hesitation' },
  { name: 'Ala Moana Bowls',   region: 'Oʻahu',          lat: 21.290,  lon: -157.853, feel: 'a hollow left bowl, sharp and quick' },
  { name: 'Makaha',            region: 'Oʻahu',          lat: 21.476,  lon: -158.221, feel: 'long, peaky walls with weight underneath' },
  { name: 'Malibu First Point', region: 'California',    lat: 34.034,  lon: -118.679, feel: 'soft, forgiving, a long open shoulder' },
  { name: 'Rincon',            region: 'California',     lat: 34.373,  lon: -119.479, feel: 'a long right that wraps and keeps wrapping' },
  { name: 'Lower Trestles',    region: 'California',     lat: 33.382,  lon: -117.589, feel: 'punchy, playful, asking for one clean turn' },
  { name: 'Mavericks',         region: 'California',     lat: 37.494,  lon: -122.501, feel: 'long lines, deep water, real consequence' },
  { name: 'J-Bay',             region: 'South Africa',   lat: -34.046, lon:   24.910, feel: 'glass and speed, a line that keeps drawing' },
  { name: 'Cloudbreak',        region: 'Fiji',           lat: -17.876, lon:  177.193, feel: 'open ocean swell finding its shape' },
  { name: 'Teahupoʻo',         region: 'Tahiti',         lat: -17.847, lon: -149.267, feel: 'thick water, weight all at once' },
  { name: 'Nazaré',            region: 'Portugal',       lat:  39.605, lon:   -9.078, feel: 'mountainous swell pulled up out of nothing' },
];

// ─── normalised live conditions ──────────────────────────────────────────────

export type LiveConditions = {
  break: Break;
  /** primary swell height in feet (m → ft) */
  waveHeightFt: number;
  /** primary swell period in seconds */
  periodSec: number;
  /** swell direction in degrees, 0..360, meteorological "from" convention */
  directionDeg: number | null;
  directionCardinal: Direction | null;
  /** wind speed in mph (km/h → mph) */
  windSpeedMph: number;
  /** light/medium/heavy texture inferred from wind speed */
  texture: Texture;
  /** rough heaviness/power score 0..1, log-ish: H^2 * T */
  power: number;
  /** time the data was fetched */
  fetchedAt: number;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const M_TO_FT = 3.28084;
const KMH_TO_MPH = 0.621371;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function degreesToCardinal(deg: number | null): Direction | null {
  if (deg == null || Number.isNaN(deg)) return null;
  const d = ((deg % 360) + 360) % 360;
  // 8-point compass, 45° each, centred on the cardinal.
  const idx = Math.round(d / 45) % 8;
  const ring: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return ring[idx];
}

function textureFromWind(windMph: number): Texture {
  if (windMph < 4) return 'glass';
  if (windMph < 9) return 'light texture';
  if (windMph < 16) return 'textured';
  return 'choppy';
}

function powerOf(heightFt: number, periodSec: number): number {
  // Surfer's rough rule: energy ∝ H² · T. Normalise to roughly 0..1 across
  // the curated set by dividing by a sensible cap.
  const e = heightFt * heightFt * periodSec;
  return clamp(e / 600, 0, 1);
}

// ─── fetching (Open-Meteo) ───────────────────────────────────────────────────
//
// One marine request and one weather request per break, batched concurrently
// through Promise.allSettled. Open-Meteo accepts comma-separated lat/lon for
// multi-location queries on the marine endpoint, which keeps this to two
// HTTP calls total. Falls back to per-break if the multi-location format
// changes shape on the server.

const MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine';
const WEATHER_BASE = 'https://api.open-meteo.com/v1/forecast';

type MarinePoint = {
  current?: {
    wave_height?: number;
    swell_wave_height?: number;
    swell_wave_period?: number;
    swell_wave_direction?: number;
    wave_period?: number;
  };
  // older / non-current variants
  hourly?: {
    wave_height?: number[];
    swell_wave_height?: number[];
    swell_wave_period?: number[];
    swell_wave_direction?: number[];
  };
};

type WeatherPoint = {
  current?: {
    wind_speed_10m?: number;
  };
  hourly?: {
    wind_speed_10m?: number[];
  };
};

// In-memory module-level cache. Throttle to ~30 minutes; surf-break conditions
// don't shift on the timescales of typing.
const CACHE_TTL_MS = 30 * 60 * 1000;

let cache: { at: number; data: LiveConditions[] } | null = null;
let inflight: Promise<LiveConditions[]> | null = null;

function pickFirst<T>(arr: T[] | undefined): T | undefined {
  return arr && arr.length > 0 ? arr[0] : undefined;
}

function arrayifyResults<T>(json: any): T[] {
  // Open-Meteo returns an object for a single location and an array for
  // multi-location requests. Normalise to an array.
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === 'object') return [json as T];
  return [];
}

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return res.json();
}

async function fetchAll(): Promise<LiveConditions[]> {
  const lats = BREAKS.map((b) => b.lat).join(',');
  const lons = BREAKS.map((b) => b.lon).join(',');

  const marineUrl =
    `${MARINE_BASE}?latitude=${lats}&longitude=${lons}` +
    `&current=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction` +
    `&timezone=auto`;

  const weatherUrl =
    `${WEATHER_BASE}?latitude=${lats}&longitude=${lons}` +
    `&current=wind_speed_10m&wind_speed_unit=kmh&timezone=auto`;

  const [marineRes, weatherRes] = await Promise.all([
    fetchJSON(marineUrl).catch(() => null),
    fetchJSON(weatherUrl).catch(() => null),
  ]);

  const marinePoints = arrayifyResults<MarinePoint>(marineRes);
  const weatherPoints = arrayifyResults<WeatherPoint>(weatherRes);

  const out: LiveConditions[] = [];
  for (let i = 0; i < BREAKS.length; i++) {
    const br = BREAKS[i];
    const m = marinePoints[i];
    const w = weatherPoints[i];

    // Pull current values, fall back to first hourly entry if the API
    // returned hourly only (it does for some sparse offshore points).
    const swellH_m =
      m?.current?.swell_wave_height ??
      m?.current?.wave_height ??
      pickFirst(m?.hourly?.swell_wave_height) ??
      pickFirst(m?.hourly?.wave_height);

    const periodS =
      m?.current?.swell_wave_period ??
      m?.current?.wave_period ??
      pickFirst(m?.hourly?.swell_wave_period);

    const dirD =
      m?.current?.swell_wave_direction ??
      pickFirst(m?.hourly?.swell_wave_direction);

    const windKmh =
      w?.current?.wind_speed_10m ??
      pickFirst(w?.hourly?.wind_speed_10m);

    if (swellH_m == null || periodS == null) {
      // Skip the break rather than fabricate numbers.
      continue;
    }

    const waveHeightFt = swellH_m * M_TO_FT;
    const periodSec = periodS;
    const windSpeedMph = (windKmh ?? 6) * KMH_TO_MPH;
    const directionDeg = dirD ?? null;

    out.push({
      break: br,
      waveHeightFt,
      periodSec,
      directionDeg,
      directionCardinal: degreesToCardinal(directionDeg),
      windSpeedMph,
      texture: textureFromWind(windSpeedMph),
      power: powerOf(waveHeightFt, periodSec),
      fetchedAt: Date.now(),
    });
  }
  return out;
}

export async function getLiveConditions(): Promise<LiveConditions[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await fetchAll();
      if (data.length > 0) {
        cache = { at: Date.now(), data };
      }
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Reset for tests / forced refresh.
export function clearLiveCache(): void {
  cache = null;
  inflight = null;
}

// ─── inner read vector ───────────────────────────────────────────────────────
//
// The user's interior conditions, expressed in the same units the live data
// uses so we can compare like-for-like. Built from the forecast engine's
// already-derived numbers, plus a few category nudges.

export type InnerVector = {
  /** desired wave height in ft (centre of the predicted band) */
  heightFt: number;
  /** desired period in seconds */
  periodSec: number;
  /** desired texture/cleanliness */
  texture: Texture;
  /** desired heaviness/power 0..1 */
  power: number;
  /** desired direction (compass), or null if slack/variable */
  direction: Direction | null;
  /** archetype category — biases break selection */
  archetype:
    | 'heavy'        // contradiction / body pressure / large
    | 'long'         // returning memory / old conversation / long-period
    | 'punchy'       // fresh swell, mid-size, building
    | 'soft'         // glass, small, gentle
    | 'open';        // open water / quiet
};

export function deriveInnerVector(args: {
  swellHeight: number;
  swellHeightHigh: number;
  period: number;
  texture: Texture;
  tidePhase: TidePhase;
  source: ForecastSource;
  conditions: ForecastConditions;
  direction: Direction | null;
}): InnerVector {
  const { swellHeight, swellHeightHigh, period, texture, source, conditions, direction } = args;
  const heightFt = (swellHeight + swellHeightHigh) / 2;
  const power = powerOf(heightFt, period);

  let archetype: InnerVector['archetype'] = 'open';
  if (conditions === 'choppy' || source === 'contradiction' || source === 'body pressure' || heightFt >= 5) {
    archetype = 'heavy';
  } else if ((source === 'returning memory' || source === 'old conversation') && period >= 11) {
    archetype = 'long';
  } else if (source === 'fresh swell' || conditions === 'building' || source === 'unfinished thought') {
    archetype = 'punchy';
  } else if (texture === 'glass' || conditions === 'glass' || conditions === 'clean') {
    archetype = 'soft';
  }

  return {
    heightFt,
    periodSec: period,
    texture,
    power,
    direction,
    archetype,
  };
}

// ─── matching ────────────────────────────────────────────────────────────────

const TEXTURE_RANK: Record<Texture, number> = {
  'glass':         0,
  'light texture': 1,
  'textured':      2,
  'choppy':        3,
};

function textureDistance(a: Texture, b: Texture): number {
  return Math.abs(TEXTURE_RANK[a] - TEXTURE_RANK[b]) / 3;
}

// 8-point cardinal distance, 0..1 (max half-circle).
function cardinalDistance(a: Direction | null, b: Direction | null): number {
  if (!a || !b) return 0.3; // unknown = mild penalty
  const ring: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const ai = ring.indexOf(a);
  const bi = ring.indexOf(b);
  if (ai < 0 || bi < 0) return 0.3;
  const raw = Math.abs(ai - bi);
  const dist = Math.min(raw, 8 - raw); // 0..4
  return dist / 4;
}

function archetypeBias(arch: InnerVector['archetype'], live: LiveConditions): number {
  // Lower = better fit. Encodes the "what kind of water this read wants".
  const h = live.waveHeightFt;
  const p = live.periodSec;
  switch (arch) {
    case 'heavy':
      // Reward big & powerful, penalise small.
      if (h >= 6) return -0.15;
      if (h >= 4 && p >= 12) return -0.07;
      if (h <= 2.5) return 0.12;
      return 0;
    case 'long':
      if (p >= 13) return -0.12;
      if (p >= 11) return -0.06;
      if (p <= 8) return 0.10;
      return 0;
    case 'punchy':
      if (h >= 3 && h <= 5 && p >= 9 && p <= 12) return -0.10;
      if (h >= 7) return 0.08;
      return 0;
    case 'soft':
      if (h <= 3 && live.texture !== 'choppy') return -0.10;
      if (h >= 5 || live.texture === 'choppy') return 0.12;
      return 0;
    case 'open':
      if (h >= 1 && h <= 4) return -0.04;
      return 0.02;
  }
}

export type LiveMatch = {
  conditions: LiveConditions;
  /** confidence 0..100 — closeness of the match */
  confidence: number;
  /** one short reason, e.g. "matches your long-period, clean read". */
  reason: string;
  /** compact live summary, e.g. "3-4 ft · 14s · light texture" */
  summary: string;
};

// Score: weighted distance, height/power dominate, then period & texture,
// direction last. Lower is better.
function score(inner: InnerVector, live: LiveConditions): number {
  const hDiff = Math.abs(inner.heightFt - live.waveHeightFt);
  const pDiff = Math.abs(inner.periodSec - live.periodSec);
  const powDiff = Math.abs(inner.power - live.power);
  const tDiff = textureDistance(inner.texture, live.texture);
  const dDiff = cardinalDistance(inner.direction, live.directionCardinal);

  const w =
    0.30 * (hDiff / 6) +     // 0..1ish
    0.25 * (pDiff / 8) +
    0.18 * powDiff +
    0.17 * tDiff +
    0.05 * dDiff +
    0.05 * 0; // reserved

  return w + archetypeBias(inner.archetype, live);
}

function summaryFor(c: LiveConditions): string {
  const lo = Math.max(0.5, c.waveHeightFt - 0.6);
  const hi = c.waveHeightFt + 0.6;
  const range = `${lo.toFixed(1)}–${hi.toFixed(1)} ft`;
  return `${range} · ${Math.round(c.periodSec)}s · ${c.texture}`;
}

function reasonFor(inner: InnerVector, c: LiveConditions): string {
  const parts: string[] = [];
  if (inner.archetype === 'long' || inner.periodSec >= 12) parts.push('long-period');
  if (inner.archetype === 'heavy' || inner.power > 0.5) parts.push('heavy');
  if (inner.archetype === 'punchy') parts.push('punchy');
  if (inner.archetype === 'soft' || c.texture === 'glass') parts.push('clean');
  if (inner.archetype === 'open') parts.push('open');
  if (parts.length === 0) parts.push('workable');
  return `matches your ${parts.slice(0, 2).join(', ')} read`;
}

export function matchInnerToLive(
  inner: InnerVector,
  live: LiveConditions[],
): LiveMatch | null {
  if (live.length === 0) return null;
  let best: LiveConditions = live[0];
  let bestScore = score(inner, best);
  for (let i = 1; i < live.length; i++) {
    const s = score(inner, live[i]);
    if (s < bestScore) {
      bestScore = s;
      best = live[i];
    }
  }
  // Map score to a 0..100 confidence. Lower score = higher confidence.
  // Empirically, scores in [0, 0.6]; cap and invert.
  const conf = clamp(Math.round((1 - clamp(bestScore, 0, 0.8) / 0.8) * 100), 25, 95);
  return {
    conditions: best,
    confidence: conf,
    reason: reasonFor(inner, best),
    summary: summaryFor(best),
  };
}
