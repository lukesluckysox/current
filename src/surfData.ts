// Live surf-data resonance.
//
// Pulls public marine + wind conditions for a broad global atlas of real surf
// breaks from Open-Meteo (no API key, no scraping) and matches them against
// the user's inner "read" vector. The chosen break is whichever real spot is
// *currently* experiencing conditions most similar to the inner state — not
// an archetype picked by label. The app frames this as "your inner read most
// resembles live water at X" and never claims to be Surfline data.
//
// Open-Meteo Marine API:  https://open-meteo.com/en/docs/marine-weather-api
// Open-Meteo Weather API: https://open-meteo.com/en/docs

import type { Texture, Direction, ForecastSource, ForecastConditions, TidePhase } from './forecast';

// ─── break atlas ─────────────────────────────────────────────────────────────
//
// A global set of real surf spots covering the major condition flavours:
// soft/longboard, pointbreak, beachbreak, slab/reef, big-wave, cold-water,
// tropical, windy, clean long-period. Each break carries a small "working
// window" — ideal swell direction(s), workable size band, minimum period,
// archetype — so live conditions can be scored against the spot's actual
// preference rather than a generic distance.
//
// Lat/lon are accurate-ish (within a kilometre or so). They only need to be
// close enough that Open-Meteo returns ocean conditions for the cell.

export type BreakArchetype =
  | 'soft'        // small, gentle, longboard
  | 'point'       // long wrapping point
  | 'beachbreak'  // shifty, punchy, short period
  | 'reef'        // shallow, sharp
  | 'slab'        // thick water, low tide
  | 'bigwave'     // open-ocean giant
  | 'tropical'    // warm reef
  | 'cold'        // cold-water heavy
  | 'wind';       // windy / choppy expression

export type Break = {
  name: string;
  region: string;
  lat: number;
  lon: number;
  /** poetic / felt character, used as fallback copy when match is loose. */
  feel: string;
  archetype: BreakArchetype;
  /** ideal swell directions in 8-point compass (the swell *coming from*). */
  idealDirs: Direction[];
  /** workable size band in feet (swell height, not face). */
  minFt: number;
  maxFt: number;
  /** minimum useful period in seconds. */
  minPeriod: number;
  /** rough heaviness 0..1 — used as a soft target for the power channel. */
  heaviness: number;
};

export const BREAKS: Break[] = [
  // — Hawaiʻi —
  { name: 'Waikiki',          region: 'Oʻahu',         lat:  21.276, lon: -157.828, archetype: 'soft',       idealDirs: ['S','SW','SE'], minFt: 0.5, maxFt: 4,  minPeriod:  8, heaviness: 0.10, feel: 'small, warm, easy to step into' },
  { name: 'Ala Moana Bowls',  region: 'Oʻahu',         lat:  21.290, lon: -157.853, archetype: 'reef',       idealDirs: ['S','SW'],      minFt: 2,   maxFt: 8,  minPeriod: 11, heaviness: 0.55, feel: 'a hollow left bowl, sharp and quick' },
  { name: 'Makaha',           region: 'Oʻahu',         lat:  21.476, lon: -158.221, archetype: 'point',      idealDirs: ['NW','W','SW'], minFt: 3,   maxFt: 15, minPeriod: 10, heaviness: 0.55, feel: 'long, peaky walls with weight underneath' },
  { name: 'Pipeline',         region: 'Oʻahu',         lat:  21.665, lon: -158.053, archetype: 'reef',       idealDirs: ['NW','N','W'],  minFt: 4,   maxFt: 18, minPeriod: 12, heaviness: 0.85, feel: 'heavy, square, no margin for hesitation' },
  { name: 'Sunset Beach',     region: 'Oʻahu',         lat:  21.677, lon: -158.041, archetype: 'reef',       idealDirs: ['N','NW','NE'], minFt: 4,   maxFt: 20, minPeriod: 12, heaviness: 0.70, feel: 'wide, shifting peaks, west-bowl power' },

  // — California —
  { name: 'Doheny',           region: 'California',    lat:  33.461, lon: -117.687, archetype: 'soft',       idealDirs: ['S','SW'],      minFt: 0.5, maxFt: 3,  minPeriod:  8, heaviness: 0.10, feel: 'tiny rolling sets, more memory than wave' },
  { name: 'Malibu First Point', region: 'California',  lat:  34.034, lon: -118.679, archetype: 'point',      idealDirs: ['S','SW','W'],  minFt: 1,   maxFt: 6,  minPeriod: 10, heaviness: 0.20, feel: 'soft, forgiving, a long open shoulder' },
  { name: 'Rincon',           region: 'California',    lat:  34.373, lon: -119.479, archetype: 'point',      idealDirs: ['W','NW','SW'], minFt: 2,   maxFt: 10, minPeriod: 12, heaviness: 0.40, feel: 'a long right that wraps and keeps wrapping' },
  { name: 'Lower Trestles',   region: 'California',    lat:  33.382, lon: -117.589, archetype: 'beachbreak', idealDirs: ['S','SW','W'],  minFt: 2,   maxFt: 8,  minPeriod:  9, heaviness: 0.30, feel: 'punchy, playful, asking for one clean turn' },
  { name: 'Swami’s',     region: 'California',    lat:  33.034, lon: -117.293, archetype: 'reef',       idealDirs: ['W','NW','SW'], minFt: 2,   maxFt: 10, minPeriod: 11, heaviness: 0.35, feel: 'reef-point with a clean wrapping shoulder' },
  { name: 'Ocean Beach SF',   region: 'California',    lat:  37.760, lon: -122.512, archetype: 'wind',       idealDirs: ['W','NW'],      minFt: 3,   maxFt: 15, minPeriod:  9, heaviness: 0.55, feel: 'cold, disorganised, pushes back' },
  { name: 'Mavericks',        region: 'California',    lat:  37.494, lon: -122.501, archetype: 'bigwave',    idealDirs: ['W','NW'],      minFt: 8,   maxFt: 40, minPeriod: 14, heaviness: 0.95, feel: 'long lines, deep water, real consequence' },

  // — Pacific Northwest, dropped in for cold-water variety —
  { name: 'Pacific City',     region: 'Oregon',        lat:  45.211, lon: -123.972, archetype: 'cold',       idealDirs: ['W','NW','SW'], minFt: 2,   maxFt: 12, minPeriod: 10, heaviness: 0.45, feel: 'cold dorsal-grey peaks, slow open faces' },

  // — Central & South America —
  { name: 'Puerto Escondido', region: 'Mexico',        lat:  15.860, lon:  -97.067, archetype: 'beachbreak', idealDirs: ['S','SW'],      minFt: 4,   maxFt: 20, minPeriod: 12, heaviness: 0.85, feel: 'sand-bottomed slabs, square Pacific energy' },
  { name: 'Pavones',          region: 'Costa Rica',    lat:   8.385, lon:  -83.139, archetype: 'point',      idealDirs: ['S','SW'],      minFt: 2,   maxFt: 12, minPeriod: 12, heaviness: 0.40, feel: 'one of the longest left points in the world' },
  { name: 'Chicama',          region: 'Peru',          lat:  -7.692, lon:  -79.448, archetype: 'point',      idealDirs: ['SW','S','W'],  minFt: 2,   maxFt: 10, minPeriod: 12, heaviness: 0.35, feel: 'an absurdly long left, lap after lap' },

  // — Indonesia & Pacific —
  { name: 'Uluwatu',          region: 'Bali',          lat:  -8.815, lon:  115.087, archetype: 'tropical',   idealDirs: ['SW','S','W'],  minFt: 3,   maxFt: 15, minPeriod: 12, heaviness: 0.65, feel: 'reef-point speed and warm offshore wind' },
  { name: 'Padang Padang',    region: 'Bali',          lat:  -8.811, lon:  115.103, archetype: 'reef',       idealDirs: ['SW','S'],      minFt: 4,   maxFt: 12, minPeriod: 12, heaviness: 0.75, feel: 'a hollow left throwing thick lips' },
  { name: 'Desert Point',     region: 'Lombok',        lat:  -8.740, lon:  115.836, archetype: 'reef',       idealDirs: ['S','SW'],      minFt: 3,   maxFt: 12, minPeriod: 13, heaviness: 0.75, feel: 'a long, mechanical left tube' },
  { name: 'Cloudbreak',       region: 'Fiji',          lat: -17.876, lon:  177.193, archetype: 'reef',       idealDirs: ['S','SW','SE'], minFt: 3,   maxFt: 20, minPeriod: 12, heaviness: 0.75, feel: 'open ocean swell finding its shape' },
  { name: 'Teahupoʻo',   region: 'Tahiti',        lat: -17.847, lon: -149.267, archetype: 'slab',       idealDirs: ['SW','S','W'],  minFt: 4,   maxFt: 25, minPeriod: 13, heaviness: 0.95, feel: 'thick water, weight all at once' },

  // — Australia & NZ —
  { name: 'Snapper Rocks',    region: 'Queensland',    lat: -28.165, lon:  153.551, archetype: 'point',      idealDirs: ['E','SE','NE'], minFt: 2,   maxFt: 10, minPeriod: 10, heaviness: 0.40, feel: 'a sand-perfect point that runs forever' },
  { name: 'Bells Beach',      region: 'Victoria',      lat: -38.367, lon:  144.281, archetype: 'point',      idealDirs: ['SW','S','W'],  minFt: 3,   maxFt: 15, minPeriod: 12, heaviness: 0.55, feel: 'a steady reef-point pulse you can hear coming' },
  { name: 'Shipstern Bluff',  region: 'Tasmania',      lat: -43.245, lon:  147.762, archetype: 'slab',       idealDirs: ['S','SW','W'],  minFt: 5,   maxFt: 25, minPeriod: 13, heaviness: 0.95, feel: 'a cold step-laden slab under sandstone cliffs' },
  { name: 'Raglan',           region: 'New Zealand',   lat: -37.812, lon:  174.798, archetype: 'point',      idealDirs: ['SW','W'],      minFt: 2,   maxFt: 10, minPeriod: 10, heaviness: 0.40, feel: 'long left points lighting up under green hills' },

  // — Europe —
  { name: 'Hossegor',         region: 'France',        lat:  43.667, lon:   -1.443, archetype: 'beachbreak', idealDirs: ['W','NW','SW'], minFt: 2,   maxFt: 12, minPeriod:  9, heaviness: 0.50, feel: 'short-period beachbreak, lots of motion at once' },
  { name: 'Mundaka',          region: 'Spain',         lat:  43.408, lon:   -2.700, archetype: 'point',      idealDirs: ['NW','N','W'],  minFt: 3,   maxFt: 12, minPeriod: 10, heaviness: 0.55, feel: 'a sand-river left that lines up just so' },
  { name: 'Nazaré',     region: 'Portugal',       lat:  39.605, lon:   -9.078, archetype: 'bigwave',    idealDirs: ['W','NW'],      minFt: 6,   maxFt: 60, minPeriod: 13, heaviness: 0.95, feel: 'mountainous swell pulled up out of nothing' },
  { name: 'Thurso East',      region: 'Scotland',      lat:  58.601, lon:   -3.518, archetype: 'cold',       idealDirs: ['N','NW'],      minFt: 3,   maxFt: 15, minPeriod: 11, heaviness: 0.65, feel: 'cold reef right under the castle wall' },
  { name: 'Mullaghmore',      region: 'Ireland',       lat:  54.467, lon:   -8.456, archetype: 'slab',       idealDirs: ['W','NW','SW'], minFt: 6,   maxFt: 30, minPeriod: 13, heaviness: 0.92, feel: 'a heavy Atlantic slab that only shows in storms' },

  // — Africa —
  { name: 'J-Bay',            region: 'South Africa',  lat: -34.046, lon:   24.910, archetype: 'point',      idealDirs: ['SW','S','W'],  minFt: 3,   maxFt: 15, minPeriod: 12, heaviness: 0.55, feel: 'glass and speed, a line that keeps drawing' },
  { name: 'Skeleton Bay',     region: 'Namibia',       lat: -27.117, lon:   14.495, archetype: 'point',      idealDirs: ['SW','S'],      minFt: 3,   maxFt: 12, minPeriod: 12, heaviness: 0.65, feel: 'a sand-bottom left that runs almost without end' },
  { name: 'Anchor Point',     region: 'Morocco',       lat:  30.544, lon:   -9.722, archetype: 'point',      idealDirs: ['NW','W','N'],  minFt: 3,   maxFt: 12, minPeriod: 11, heaviness: 0.50, feel: 'a long right point unspooling under desert cliffs' },
  { name: 'Killer Point',     region: 'Morocco',       lat:  30.554, lon:   -9.717, archetype: 'point',      idealDirs: ['NW','W','N'],  minFt: 4,   maxFt: 18, minPeriod: 12, heaviness: 0.65, feel: 'big-wave Atlantic right firing into rocks' },
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
  const e = heightFt * heightFt * periodSec;
  return clamp(e / 600, 0, 1);
}

// ─── fetching (Open-Meteo) ───────────────────────────────────────────────────
//
// Open-Meteo accepts comma-separated lat/lon for multi-location queries on
// both the marine and weather endpoints. With ~33 breaks the URL is well
// under typical limits. We do two HTTP calls total per refresh, cache the
// result for 30 minutes, and de-duplicate concurrent in-flight requests.

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

const CACHE_TTL_MS = 30 * 60 * 1000;

let cache: { at: number; data: LiveConditions[] } | null = null;
let inflight: Promise<LiveConditions[]> | null = null;

function pickFirst<T>(arr: T[] | undefined): T | undefined {
  return arr && arr.length > 0 ? arr[0] : undefined;
}

function arrayifyResults<T>(json: any): T[] {
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

    if (swellH_m == null || periodS == null) continue;

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

export function clearLiveCache(): void {
  cache = null;
  inflight = null;
}

// ─── inner read vector ───────────────────────────────────────────────────────

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
    | 'heavy'
    | 'long'
    | 'punchy'
    | 'soft'
    | 'open';
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

  return { heightFt, periodSec: period, texture, power, direction, archetype };
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
function cardinalDistance(a: Direction, b: Direction): number {
  const ring: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const ai = ring.indexOf(a);
  const bi = ring.indexOf(b);
  if (ai < 0 || bi < 0) return 0.5;
  const raw = Math.abs(ai - bi);
  const dist = Math.min(raw, 8 - raw);
  return dist / 4;
}

// How well the live swell direction fits this break's working window.
// 0 = within ideal directions, scales up with distance from the closest one.
function directionFit(live: Direction | null, ideal: Direction[]): number | null {
  if (!live || ideal.length === 0) return null;
  let best = Infinity;
  for (const d of ideal) {
    const dd = cardinalDistance(live, d);
    if (dd < best) best = dd;
  }
  return best;
}

// How well the live size sits inside the break's workable band.
// 0 inside the band, scales up as it falls outside (in either direction).
function sizeFit(heightFt: number, br: Break): number {
  if (heightFt >= br.minFt && heightFt <= br.maxFt) return 0;
  if (heightFt < br.minFt) {
    return clamp((br.minFt - heightFt) / 6, 0, 1);
  }
  return clamp((heightFt - br.maxFt) / 10, 0, 1);
}

// Period below the spot's minimum is a real penalty (point/slab need lines);
// above it is fine.
function periodFit(periodSec: number, br: Break): number {
  if (periodSec >= br.minPeriod) return 0;
  return clamp((br.minPeriod - periodSec) / 8, 0, 1);
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

// Return both the inner-vs-live distance and the spot-window fit. Lower is
// better for both; we fold them into a single score.
function scoreParts(inner: InnerVector, live: LiveConditions): {
  total: number;
  windowFit: number;
} {
  // — inner-vs-live channels —
  const hDiff = Math.abs(inner.heightFt - live.waveHeightFt);
  const pDiff = Math.abs(inner.periodSec - live.periodSec);
  const tDiff = textureDistance(inner.texture, live.texture);
  const powDiff = Math.abs(inner.power - live.power);

  // Direction term: only counted if both sides are known; otherwise the
  // weight is renormalised across the remaining channels so we don't penalise
  // breaks just because Open-Meteo didn't return a direction.
  const dRaw =
    inner.direction && live.directionCardinal
      ? cardinalDistance(inner.direction, live.directionCardinal)
      : null;

  // — spot-window fit (does this swell actually work at this break?) —
  const sizeFitVal = sizeFit(live.waveHeightFt, live.break);
  const periodFitVal = periodFit(live.periodSec, live.break);
  const dirFitVal = directionFit(live.directionCardinal, live.break.idealDirs); // null if unknown
  const heavinessGap = Math.abs(inner.power - live.break.heaviness);

  const windowFit =
    0.45 * sizeFitVal +
    0.20 * periodFitVal +
    0.20 * (dirFitVal ?? 0) +
    0.15 * heavinessGap;

  // Inner-vs-live distance with renormalisation when direction is unknown.
  const innerWeights = {
    height: 0.30,
    period: 0.22,
    texture: 0.18,
    power:  0.15,
    dir:    0.15,
  };
  const haveDir = dRaw != null;
  const dirContribution = haveDir ? innerWeights.dir * (dRaw as number) : 0;
  const renormScale = haveDir ? 1 : 1 / (1 - innerWeights.dir);

  const innerDist =
    (innerWeights.height * (hDiff / 6) +
      innerWeights.period * (pDiff / 8) +
      innerWeights.texture * tDiff +
      innerWeights.power * powDiff +
      dirContribution) *
    renormScale;

  // Combine: inner-vs-live distance dominates (the user wants the live spot
  // most like their inner state), with window fit as a meaningful tie-breaker
  // that distinguishes Pipeline from Teahupoʻo from Mavericks at similar live
  // numbers.
  const total = 0.65 * innerDist + 0.35 * windowFit;
  return { total, windowFit };
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

  // Score every break, then pick the lowest. Sort with window-fit as the
  // tie-breaker so two near-equal totals resolve to whichever spot the swell
  // actually works at — and so order of the input array doesn't bias the pick.
  const scored = live.map((c) => ({ c, ...scoreParts(inner, c) }));
  scored.sort((a, b) => {
    if (Math.abs(a.total - b.total) > 1e-6) return a.total - b.total;
    return a.windowFit - b.windowFit;
  });
  const best = scored[0];

  // Map score to a 0..100 confidence. Lower score = higher confidence.
  // Empirical range across the atlas: ~0..0.7.
  const conf = clamp(
    Math.round((1 - clamp(best.total, 0, 0.8) / 0.8) * 100),
    25,
    95,
  );
  return {
    conditions: best.c,
    confidence: conf,
    reason: reasonFor(inner, best.c),
    summary: summaryFor(best.c),
  };
}

// ─── tiny dev smoke check (not wired into a test runner) ─────────────────────
//
// Lets a contributor sanity-check matching without booting the app. Pass a
// constructed inner vector and a hand-rolled set of live conditions; the
// function returns the picked break name. Pure, no I/O.

export function smokeMatchName(
  inner: InnerVector,
  live: LiveConditions[],
): string | null {
  return matchInnerToLive(inner, live)?.conditions.break.name ?? null;
}
