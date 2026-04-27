// Inner surf forecast engine.
//
// Translates the app's real state — saved lines, their tags/modes, the active
// drift fragment — into compact surf-forecaster language and a recommended
// writing action. Pure: same inputs, same output. No external APIs, no time-
// of-day astrology, no random feed.

import type { Line, LineMode } from './db/database';
import { findCurrents, dominantBreak, CurrentSummary, detectEcho, Echo } from './patterns';

export type ForecastConditions = 'glass' | 'clean' | 'fair' | 'building' | 'fading' | 'choppy';
export type TidePhase = 'low' | 'flood' | 'high' | 'ebb';
export type Texture = 'glass' | 'light texture' | 'textured' | 'choppy';
export type Direction = 'NW' | 'W' | 'SW' | 'S' | 'SE' | 'E' | 'NE' | 'N';

export type ForecastSource =
  | 'unfinished thought'
  | 'old conversation'
  | 'body pressure'
  | 'returning memory'
  | 'contradiction'
  | 'quiet after release'
  | 'fresh swell'
  | 'open water';

export type ForecastAction = {
  /** writing-move label, e.g. "paradox", "save raw", "resurface". */
  kind: 'shape' | 'save' | 'resurface' | 'reshape';
  /** Verso mode to seed when kind is shape/reshape. Only the four supported
   *  Verso modes are produced: paradox, aphorism, contradiction, aside. */
  mode?: LineMode;
  /** Short button label. */
  label: string;
  /** Long-form recommendation, e.g. "good for paradox". */
  hint: string;
};

// Internal compass — two layered direction readings rendered alongside
// wave height. Surface wind = what is moving across the user *now*
// (immediate fragment / tide / terrain). Deep swell = the longer pattern
// traveling underneath (returning currents / dominant break / forecast
// source). Both carry a one-line interior phrase rather than weather.
export type CompassReading = {
  direction: Direction | null;   // null when slack / variable
  label: string;                 // short tag e.g. "textured", "returning", "slack"
  phrase: string;                // one-line interior reading
};

export type Forecast = {
  // Numeric readouts.
  swellHeight: number;        // ft (low end of the range)
  swellHeightHigh: number;    // ft (high end of the range)
  period: number;             // seconds
  direction: Direction;
  texture: Texture;
  tidePhase: TidePhase;
  tideLevel: number;          // 0..1
  confidence: number;         // 0..100

  // Words.
  conditions: ForecastConditions;
  phrase: string;             // poetic summary, conditions-driven
  reading: string;            // "why" — surf-forecaster explanation in the user's signals
  source: ForecastSource;     // swell origin label

  // What to do next.
  action: ForecastAction;

  // Bar series for the mini chart, normalised 0..1.
  series: number[];

  // Optional resurface candidate: a line worth pulling up under current conditions.
  resurface: Line | null;

  // Returning currents: tags or words that recur across saved lines. Empty
  // when the user does not yet have enough material for a pattern.
  currents: CurrentSummary[];

  // Interpretive synthesis: one short, in-world sentence summarizing the
  // dominant break and current. e.g. "freedom keeps returning · contradiction
  // is the dominant break."
  interpretive: string | null;

  // Echo: when an active fragment touches a returning current. Surfaces the
  // older line as a "return to this" affordance.
  echo: Echo | null;

  // Internal compass — surface wind & deep swell, paired with wave height.
  surfaceWind: CompassReading;
  deepSwell: CompassReading;

  // Real-world surf break the inner conditions most resemble. Not real
  // weather, not real surf data — a felt analogy from the same signals.
  resemblance: BreakResemblance;
};

export type BreakResemblance = {
  /** Break name, e.g. "Rincon", "Pipeline". */
  name: string;
  /** One short evocative line about the feel, e.g. "clean wrapping pulse". */
  feel: string;
};

const DIRECTIONS: Direction[] = ['NW', 'W', 'SW', 'S', 'SE', 'E', 'NE', 'N'];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'is', 'it',
  'i', 'you', 'we', 'my', 'your', 'this', 'that', 'with', 'for', 'as', 'at',
  'be', 'are', 'was', 'were', 'been', 'so', 'if', 'than', 'then', 'just',
  'when', 'where', 'how', 'what', 'who', 'why', 'do', 'does', 'did', 'have',
  'has', 'had', 'into', 'about', 'from', 'by', 'me', 'us', 'our',
]);

export type FragmentContext = {
  /** unsaved text in the Drift input */
  text: string;
  tide: string | null;
  terrain: string | null;
  constellation: string | null;
};

// ─── derivation helpers ──────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function topOf<T>(items: T[]): T | null {
  return items.length > 0 ? items[0] : null;
}

function tally<T>(values: Array<T | null | undefined>): Array<{ key: T; count: number }> {
  const map = new Map<T, number>();
  for (const v of values) {
    if (v == null) continue;
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

function lastTime(lines: Line[]): number | null {
  if (lines.length === 0) return null;
  return Math.max(...lines.map((l) => l.created_at));
}

function fragmentKeyword(text: string): string | null {
  if (!text) return null;
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\s']/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  return words.length > 0 ? words[words.length - 1] : null;
}

function fragmentEcho(fragment: string, lines: Line[]): Line | null {
  const kw = fragmentKeyword(fragment);
  if (!kw) return null;
  const re = new RegExp(`\\b${kw}\\b`, 'i');
  return lines.find((l) => re.test(l.content)) ?? null;
}

// ─── source label inference ──────────────────────────────────────────────────

function inferSource(
  fragment: FragmentContext,
  lines: Line[],
  lastLine: Line | null,
  nowSec: number,
): ForecastSource {
  const text = fragment.text.trim();
  // Active fragment in the input is the strongest signal.
  if (text.length > 0) {
    if (fragment.constellation) return 'old conversation';
    if (fragment.terrain && /sharp|hardened|narrow/i.test(fragment.terrain)) return 'body pressure';
    if (/never|always|but|yet|still|even though|paradox/i.test(text)) return 'contradiction';
    if (fragmentEcho(text, lines)) return 'returning memory';
    return 'unfinished thought';
  }

  // No active fragment — read the room from saved-line state.
  if (!lastLine) return 'open water';

  const ageHours = (nowSec - lastLine.created_at) / 3600;
  if (ageHours > 36) return 'open water';

  if (lastLine.constellation) return 'old conversation';
  if (lastLine.mode === 'paradox' || lastLine.mode === 'contradiction' || lastLine.mode === 'invert') return 'contradiction';
  if (lastLine.terrain && /sharp|hardened|narrow|tender/i.test(lastLine.terrain)) {
    return 'body pressure';
  }
  if (lastLine.tide && /low tide|dead calm|slack water|golden hour|glass water/i.test(lastLine.tide)) {
    return 'quiet after release';
  }
  if (lastLine.tide && /storm front|building chop|heavy current|returning swell|rising swell/i.test(lastLine.tide)) {
    return 'fresh swell';
  }
  return 'returning memory';
}

// ─── condition derivation ────────────────────────────────────────────────────

function inferTexture(fragment: FragmentContext, lastLine: Line | null): Texture {
  const tide = (fragment.tide ?? lastLine?.tide ?? '').toLowerCase();
  if (/glass water|dead calm|slack water|golden hour/.test(tide)) return 'glass';
  if (/storm front|building chop|heavy current/.test(tide)) return 'choppy';
  if (/returning swell|rising swell|offshore winds/.test(tide)) return 'light texture';
  const terrain = (fragment.terrain ?? lastLine?.terrain ?? '').toLowerCase();
  if (/restless|sharp/.test(terrain)) return 'textured';
  if (/still|porous/.test(terrain)) return 'glass';
  return 'textured';
}

function inferTidePhase(
  lines: Line[],
  nowSec: number,
  recentCluster: number,
): TidePhase {
  // Saved-line rhythm drives the phase: many recent lines = high; a long
  // quiet stretch = low; a recent uptick = flood; a recent slowdown = ebb.
  if (lines.length === 0) return 'low';
  const hour = 3600;
  const dayWindow = 24 * hour;
  const last24 = lines.filter((l) => nowSec - l.created_at <= dayWindow).length;
  const prev24 = lines.filter((l) => {
    const age = nowSec - l.created_at;
    return age > dayWindow && age <= dayWindow * 2;
  }).length;

  if (recentCluster >= 3) return 'high';
  const lastTs = lastTime(lines) ?? 0;
  const sinceLastHours = (nowSec - lastTs) / hour;
  if (sinceLastHours > 18) return 'low';
  if (last24 > prev24 + 1) return 'flood';
  if (last24 + 1 < prev24) return 'ebb';
  if (last24 >= 4) return 'high';
  return last24 >= 2 ? 'flood' : 'ebb';
}

function tideLevelForPhase(phase: TidePhase): number {
  switch (phase) {
    case 'high':  return 0.92;
    case 'flood': return 0.66;
    case 'ebb':   return 0.34;
    case 'low':   return 0.10;
  }
}

function inferConditions(
  texture: Texture,
  tidePhase: TidePhase,
  hasFragment: boolean,
): ForecastConditions {
  if (texture === 'glass' && (tidePhase === 'high' || tidePhase === 'flood')) return 'glass';
  if (texture === 'choppy') return 'choppy';
  if (tidePhase === 'flood' && hasFragment) return 'building';
  if (tidePhase === 'ebb') return 'fading';
  if (texture === 'light texture') return 'clean';
  if (tidePhase === 'high') return 'clean';
  return 'fair';
}

const PHRASE_BANK: Record<ForecastConditions, string[]> = {
  glass:    ['slack water — the rare hour', 'no wind, only listening', 'the line writes itself'],
  clean:    ['clean lines, breaking true', 'the page is glassy', 'every sentence lands'],
  fair:     ['workable, with texture', 'small wind on the surface', 'lines come in sets'],
  building: ['heavy current under the words', 'the swell is building', 'something is gathering'],
  fading:   ['the set is letting go', 'lines stretch and loosen', 'the water is releasing'],
  choppy:   ['building chop — hold lines short', 'wind on the page', 'sharpen before it slips'],
};

// ─── internal compass ────────────────────────────────────────────────────────
//
// Two readings, layered. Surface wind = whatever is moving across the
// user right now (active fragment, tide tag, terrain). Deep swell = the
// longer current underneath (returning patterns, dominant break, source
// label). Each maps to one of eight compass points with a one-line
// interior phrase. No real weather — purely an internal compass.
//
// Direction model (kept consistent everywhere):
//   N  clarity / discipline / clean truth
//   E  emergence / beginning / attention
//   S  feeling / body / desire / memory
//   W  return / reflection / shadow / integration
//   NE new structure (clarity + emergence)
//   SE soft admission (emergence + feeling)
//   SW memory returning (feeling + return)
//   NW hard reckoning (return + clarity)

const SURFACE_WIND_PHRASES: Record<Direction, string> = {
  N:  'hard clarity moving across the water',
  NE: 'a new structure rising into view',
  E:  'something beginning at the surface',
  SE: 'a soft admission at the edge',
  S:  'feeling brushing the surface',
  SW: 'memory drifting back across',
  W:  'reflection moving with the wind',
  NW: 'hard reckoning moving across',
};

const DEEP_SWELL_PHRASES: Record<Direction, string> = {
  N:  'discipline traveling underneath',
  NE: 'a new shape forming below',
  E:  'something emerging from below',
  SE: 'a quiet admission underneath',
  S:  'old feeling underneath',
  SW: 'memory returning from below',
  W:  'an old shadow circling back',
  NW: 'a long reckoning underneath',
};

const SURFACE_LABELS: Record<Direction, string> = {
  N: 'clear', NE: 'forming', E: 'opening', SE: 'softening',
  S: 'feeling', SW: 'returning', W: 'reflecting', NW: 'reckoning',
};

const DEEP_LABELS: Record<Direction, string> = {
  N: 'discipline', NE: 'forming', E: 'emerging', SE: 'admitting',
  S: 'feeling', SW: 'returning', W: 'shadow', NW: 'reckoning',
};

// Surface wind reads the *immediate* fragment and tags. This is what is
// moving across the surface now — it changes as the user types.
function inferSurfaceWind(
  fragment: FragmentContext,
  lastLine: Line | null,
  texture: Texture,
  source: ForecastSource,
): CompassReading {
  const text = fragment.text.trim();
  const tide = (fragment.tide ?? lastLine?.tide ?? '').toLowerCase();
  const terrain = (fragment.terrain ?? lastLine?.terrain ?? '').toLowerCase();
  const hasFragment = text.length > 0;

  // Slack / variable when there is essentially no movement.
  if (!hasFragment && !tide && !terrain && !lastLine) {
    return {
      direction: null,
      label: 'slack',
      phrase: 'no wind on the surface — variable',
    };
  }

  // Direction inference, in priority order.
  let direction: Direction = 'E';

  if (source === 'contradiction') direction = 'NW'; // hard reckoning
  else if (source === 'returning memory') direction = 'SW';
  else if (source === 'body pressure') direction = 'S';
  else if (source === 'old conversation') direction = 'W';
  else if (source === 'fresh swell') direction = 'NE';
  else if (source === 'unfinished thought') direction = 'E';
  else if (source === 'quiet after release') direction = 'N';
  else if (source === 'open water') direction = 'E';

  // Texture nudges: choppy/textured pulls the surface toward NW (reckoning),
  // glass pulls it toward N (clarity).
  if (texture === 'glass' && (direction === 'E' || direction === 'NE')) direction = 'N';
  if (texture === 'choppy') direction = direction === 'S' ? 'SW' : 'NW';

  // Terrain nudges.
  if (/sharp|hardened/.test(terrain)) direction = direction === 'E' ? 'NE' : direction;
  if (/tender|porous|still/.test(terrain) && direction !== 'NW') direction = 'S';
  if (/restless/.test(terrain) && (direction === 'E' || direction === 'N')) direction = 'NE';

  const textureLabel: string = texture === 'glass' ? 'glassy'
    : texture === 'light texture' ? 'light texture'
    : texture === 'choppy' ? 'choppy'
    : 'textured';

  return {
    direction,
    label: textureLabel,
    phrase: SURFACE_WIND_PHRASES[direction],
  };
}

// Deep swell reads the *longer* pattern: returning currents, dominant
// break, the source label. It changes slowly — by design.
function inferDeepSwell(
  currents: CurrentSummary[],
  domBreak: LineMode | null,
  source: ForecastSource,
  tidePhase: TidePhase,
  lineCount: number,
): CompassReading {
  // Not enough material yet — present as slack rather than guess.
  if (lineCount < 3 && currents.length === 0) {
    return {
      direction: null,
      label: 'open water',
      phrase: 'no deep current yet — listen',
    };
  }

  let direction: Direction = 'S';
  let label = 'returning';

  // Dominant break biases the deep direction.
  if (domBreak === 'paradox') { direction = 'NW'; label = 'reckoning'; }
  else if (domBreak === 'contradiction') { direction = 'NW'; label = 'reckoning'; }
  else if (domBreak === 'aphorism') { direction = 'N'; label = 'discipline'; }
  else if (domBreak === 'aside') { direction = 'W'; label = 'slanting'; }
  // Legacy modes still occasionally surface from old data — map them so the
  // compass stays coherent without offering them as new actions.
  else if (domBreak === 'distill') { direction = 'N'; label = 'discipline'; }
  else if (domBreak === 'invert') { direction = 'W'; label = 'reflecting'; }
  else if (domBreak === 'complete') { direction = 'NE'; label = 'forming'; }

  // Top current refines it. Word currents pull south (feeling/memory);
  // recurring tags pull along their tide/terrain hue.
  const top = currents[0];
  if (top) {
    if (top.kind === 'word') {
      // A returning word almost always reads as memory/feeling beneath.
      direction = direction === 'NW' ? 'NW' : 'SW';
      label = top.value.toLowerCase();
    } else if (top.kind === 'tide') {
      const v = top.value.toLowerCase();
      if (/storm|chop|heavy/.test(v)) { direction = 'NW'; label = 'reckoning'; }
      else if (/glass|slack|golden|offshore/.test(v)) { direction = 'N'; label = 'clear'; }
      else if (/return|rising/.test(v)) { direction = 'SW'; label = 'returning'; }
      else if (/low|dead/.test(v)) { direction = 'W'; label = 'reflecting'; }
    } else if (top.kind === 'terrain') {
      const v = top.value.toLowerCase();
      if (/sharp|hardened/.test(v)) { direction = 'NW'; label = 'reckoning'; }
      else if (/tender|porous|still/.test(v)) { direction = 'S'; label = 'feeling'; }
      else if (/restless|narrow/.test(v)) { direction = 'NE'; label = 'forming'; }
    } else if (top.kind === 'constellation') {
      direction = 'W'; label = 'with ' + top.value.toLowerCase();
    }
  } else {
    // No returning current. Fall back to source/tide phase.
    if (source === 'contradiction') { direction = 'NW'; label = 'reckoning'; }
    else if (source === 'returning memory') { direction = 'SW'; label = 'returning'; }
    else if (source === 'body pressure') { direction = 'S'; label = 'feeling'; }
    else if (source === 'fresh swell') { direction = 'NE'; label = 'forming'; }
    else if (tidePhase === 'low') { direction = 'W'; label = 'quiet'; }
    else if (tidePhase === 'high') { direction = 'N'; label = 'clear'; }
  }

  // Compose the phrase. If we have a top word/tag current, prefer a
  // sentence that names what is returning over the generic phrase.
  let phrase = DEEP_SWELL_PHRASES[direction];
  if (top) {
    const word = top.kind === 'word' ? top.value : top.value.toLowerCase();
    if (top.kind === 'word') {
      phrase = `${word} returning underneath`;
    } else if (top.kind === 'constellation') {
      phrase = `${word} moving below the surface`;
    } else if (direction === 'NW') {
      phrase = `${word} pressing up from below`;
    }
  }

  // Fall back to a generic short label if the chosen one is too long for
  // the chip. (Caller will truncate visually.)
  return { direction, label, phrase };
}

// Render a compass reading's chip line, e.g. "NW · textured". Exposed so
// the UI can build the same string without re-deriving direction logic.
export function compassChip(r: CompassReading): string {
  if (!r.direction) return r.label;
  return `${r.direction} · ${r.label}`;
}

// Look up the short surface/deep label families. Exported for tests and
// for the info-modal copy if it ever needs to render the legend.
export function compassLegend(): {
  surface: Record<Direction, string>;
  deep: Record<Direction, string>;
} {
  return { surface: SURFACE_LABELS, deep: DEEP_LABELS };
}

// ─── action recommendation ───────────────────────────────────────────────────

function recommendAction(
  hasFragment: boolean,
  source: ForecastSource,
  conditions: ForecastConditions,
  lastLine: Line | null,
  hasResurface: boolean,
): ForecastAction {
  if (hasFragment) {
    if (source === 'contradiction') {
      return { kind: 'shape', mode: 'contradiction', label: 'shape contradiction →', hint: 'expose the split' };
    }
    if (conditions === 'choppy' || conditions === 'fading') {
      return { kind: 'shape', mode: 'aphorism', label: 'sharpen →', hint: 'compress before it slips' };
    }
    if (conditions === 'glass' || conditions === 'clean') {
      return { kind: 'shape', mode: 'aphorism', label: 'sharpen →', hint: 'glass — one portable line' };
    }
    if (conditions === 'building') {
      return { kind: 'shape', mode: 'paradox', label: 'shape paradox →', hint: 'two truths gathering' };
    }
    if (source === 'returning memory') {
      return { kind: 'shape', mode: 'aside', label: 'turn it sideways →', hint: 'an aside on what keeps returning' };
    }
    return { kind: 'save', label: 'save raw', hint: 'keep it as a fragment' };
  }

  // No active fragment.
  if (hasResurface) {
    return { kind: 'resurface', label: 'resurface →', hint: 'pull a line from below' };
  }
  if (lastLine && lastLine.mode === 'fragment') {
    return {
      kind: 'reshape',
      mode: 'aphorism',
      label: 'reshape last →',
      hint: 'last fragment unfinished',
    };
  }
  return { kind: 'save', label: 'drop in', hint: 'open water · listen' };
}

// ─── resurface candidate ─────────────────────────────────────────────────────

function pickResurface(
  lines: Line[],
  fragment: FragmentContext,
  conditions: ForecastConditions,
  tidePhase: TidePhase,
): Line | null {
  if (lines.length === 0) return null;

  // If fragment text is present, prefer an echo of it.
  if (fragment.text.trim()) {
    const echo = fragmentEcho(fragment.text, lines);
    if (echo) return echo;
  }

  // If a context tag is active on the fragment, prefer a line sharing that tag.
  if (fragment.constellation) {
    const m = lines.find((l) => l.constellation === fragment.constellation);
    if (m) return m;
  }
  if (fragment.terrain) {
    const m = lines.find((l) => l.terrain === fragment.terrain);
    if (m) return m;
  }
  if (fragment.tide) {
    const m = lines.find((l) => l.tide === fragment.tide);
    if (m) return m;
  }

  // Condition-driven default: low/quiet → an older deep line; choppy → a recent
  // raw fragment to distill; building → a favorite to extend.
  const sorted = [...lines].sort((a, b) => a.created_at - b.created_at);
  if (tidePhase === 'low' || conditions === 'fading') {
    // an older line, deeper in the stack
    return sorted[Math.floor(sorted.length * 0.25)] ?? sorted[0] ?? null;
  }
  if (conditions === 'choppy') {
    return lines.find((l) => l.mode === 'fragment') ?? lines[0] ?? null;
  }
  if (conditions === 'building' || conditions === 'glass') {
    return lines.find((l) => l.is_favorite === 1) ?? lines[0] ?? null;
  }
  return null;
}

// ─── public entry point ──────────────────────────────────────────────────────

// Map derived inner conditions to a real-world break the user's session
// "most resembles" — purely felt analogy, never claimed as real surf data.
// Driver: swell height (size), period (organisation), texture (cleanliness),
// tide phase, source (origin of the swell).
function inferBreak(args: {
  swellHeight: number;
  swellHeightHigh: number;
  period: number;
  texture: Texture;
  tidePhase: TidePhase;
  source: ForecastSource;
  conditions: ForecastConditions;
}): BreakResemblance {
  const { swellHeight, swellHeightHigh, period, texture, tidePhase, source, conditions } = args;
  const peak = swellHeightHigh;

  // Heaviest first — large, hollow, charged.
  if (peak >= 6.0 && source === 'contradiction') {
    return { name: 'Pipeline', feel: 'heavy, square, no margin for hesitation' };
  }
  if (peak >= 6.0 && (source === 'body pressure' || texture === 'choppy')) {
    return { name: 'Teahupoʻo', feel: 'thick water, weight all at once' };
  }
  if (peak >= 5.5 && (tidePhase === 'flood' || tidePhase === 'high') && period >= 14) {
    return { name: 'Mavericks', feel: 'long lines, deep water, real consequence' };
  }
  if (peak >= 5.0 && period >= 13 && texture !== 'choppy') {
    return { name: 'Nazaré', feel: 'mountainous swell pulled up out of nothing' };
  }

  // Long-period, organised, clean.
  if (period >= 13 && conditions === 'clean' && (source === 'returning memory' || source === 'old conversation')) {
    return { name: 'Rincon', feel: 'a long right that wraps and keeps wrapping' };
  }
  if (period >= 12 && texture === 'glass' && conditions !== 'choppy') {
    return { name: 'J-Bay', feel: 'glass and speed, a line that keeps drawing forward' };
  }
  if (peak >= 4.0 && period >= 12 && conditions === 'building') {
    return { name: 'Cloudbreak', feel: 'open ocean swell finding its shape' };
  }

  // Punchy, mid-size, sharp.
  if (peak >= 3.5 && conditions === 'building' && (source === 'fresh swell' || source === 'unfinished thought')) {
    return { name: 'Lower Trestles', feel: 'punchy, playful, asking for one clean turn' };
  }
  if (texture === 'choppy' && peak >= 3.0) {
    return { name: 'Ocean Beach', feel: 'cold, disorganised, pushes back' };
  }

  // Soft, forgiving, mid-tide.
  if (peak <= 3.0 && (tidePhase === 'high' || tidePhase === 'flood') && (texture === 'glass' || texture === 'light texture')) {
    return { name: 'Malibu First Point', feel: 'soft, forgiving, a long open shoulder' };
  }
  if (peak <= 2.5 && conditions === 'glass') {
    return { name: 'Waikiki Canoes', feel: 'small, warm, easy to step into' };
  }

  // Quiet — barely breaking.
  if (conditions === 'fading' || (tidePhase === 'low' && peak <= 2.0)) {
    return { name: 'Doheny', feel: 'tiny rolling sets, more memory than wave' };
  }

  // Returning, slow-building, longer-period — feels like a point lighting up.
  if (period >= 11 && (source === 'returning memory' || source === 'old conversation')) {
    return { name: 'Bells Beach', feel: 'a steady reef-point pulse you can hear coming' };
  }

  // Fragmenty / fresh — short-period beachbreak energy.
  if (period <= 9 && (source === 'fresh swell' || source === 'unfinished thought')) {
    return { name: 'Hossegor', feel: 'short-period beachbreak, lots of motion at once' };
  }

  // Reasonable default — workable, with texture.
  return { name: 'Bondi', feel: 'workable surf, a little texture, plenty to ride' };
}

export function computeForecast(
  lines: Line[],
  fragment: FragmentContext,
  now: Date = new Date(),
): Forecast {
  const nowSec = Math.floor(now.getTime() / 1000);
  const sortedDesc = [...lines].sort((a, b) => b.created_at - a.created_at);
  const lastLine = sortedDesc[0] ?? null;
  const hasFragment = fragment.text.trim().length > 0;

  // Cluster: number of saves in the last hour. Non-dashboardy — used as a
  // rhythm signal, not displayed as a count.
  const hour = 3600;
  const recentCluster = sortedDesc.filter((l) => nowSec - l.created_at <= hour).length;

  // Swell height: blends fragment length, age of last line, recent cluster.
  // 0.8..6.5 ft. Long fragment + recent cluster = bigger swell. Quiet stretch
  // = smaller, more glassy reading.
  let swellHeight = 1.5;
  if (hasFragment) swellHeight += Math.min(2.5, fragment.text.length / 60);
  if (recentCluster > 0) swellHeight += Math.min(2.0, recentCluster * 0.6);
  if (lastLine) {
    const ageH = (nowSec - lastLine.created_at) / hour;
    if (ageH < 1) swellHeight += 0.4;
    else if (ageH > 24) swellHeight = Math.max(1.0, swellHeight - 0.6);
  }
  swellHeight = clamp(swellHeight, 1.0, 6.5);
  const swellHeightHigh = swellHeight + 1.2;

  // Period: distance between recent saves. Short cadence = short period;
  // long stretches = long period.
  let period = 10;
  if (sortedDesc.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < Math.min(6, sortedDesc.length - 1); i++) {
      gaps.push(sortedDesc[i].created_at - sortedDesc[i + 1].created_at);
    }
    const avgGapHours = gaps.reduce((a, b) => a + b, 0) / gaps.length / hour;
    period = clamp(Math.round(6 + avgGapHours * 0.6), 6, 18);
  }

  // Direction: stable while a current is dominant. Map most-recent context to
  // a compass point so the user gets a consistent feel; falls back to a
  // count-stable mapping rather than a wall-clock cycle.
  const directionSeed =
    (fragment.tide ?? lastLine?.tide ?? '') +
    (fragment.terrain ?? lastLine?.terrain ?? '') +
    (fragment.constellation ?? lastLine?.constellation ?? '');
  const directionIdx = Math.abs(hashString(directionSeed)) % DIRECTIONS.length;
  const direction = DIRECTIONS[directionIdx];

  // Texture/wind from tide & terrain tags.
  const texture = inferTexture(fragment, lastLine);

  // Tide phase from saved-line cadence.
  const tidePhase = inferTidePhase(sortedDesc, nowSec, recentCluster);
  const tideLevel = tideLevelForPhase(tidePhase);

  // Confidence: how much signal do we actually have? Amount of recent context,
  // amount of fragment text, and presence of last-line tags drive this.
  let confidence = 30;
  if (lines.length >= 3) confidence += 15;
  if (lines.length >= 12) confidence += 10;
  if (hasFragment) confidence += 15;
  if (fragment.tide || fragment.terrain || fragment.constellation) confidence += 10;
  if (lastLine?.tide || lastLine?.terrain || lastLine?.constellation) confidence += 10;
  if (recentCluster >= 2) confidence += 10;
  confidence = clamp(confidence, 25, 95);

  // Source label.
  const source = inferSource(fragment, sortedDesc, lastLine, nowSec);

  // Conditions and phrase.
  const conditions = inferConditions(texture, tidePhase, hasFragment);
  const bank = PHRASE_BANK[conditions];
  const phrase = bank[Math.abs(hashString(directionSeed + source)) % bank.length];

  // Resurface candidate.
  const resurface = pickResurface(sortedDesc, fragment, conditions, tidePhase);

  // Pattern memory: returning currents and dominant break.
  const currents = findCurrents(sortedDesc, 4);
  const domBreak = dominantBreak(sortedDesc);
  const echo = detectEcho(
    fragment.text,
    { tide: fragment.tide, terrain: fragment.terrain, constellation: fragment.constellation },
    currents,
    sortedDesc,
  );

  // Interpretive line: terse, in-world. Only emitted when we actually have
  // pattern signal — otherwise the forecast stays poetic.
  let interpretive: string | null = null;
  if (currents.length > 0 || domBreak) {
    const bits: string[] = [];
    const top = currents[0];
    if (top) {
      const word = top.kind === 'word' ? top.value : top.value.toLowerCase();
      bits.push(`${word} keeps returning`);
    }
    if (domBreak) bits.push(`${domBreak} is the dominant break`);
    interpretive = bits.join(' · ') || null;
  }

  // Action recommendation. If we caught an echo, prefer "return to this".
  const action = echo
    ? { kind: 'resurface' as const, label: 'return to this →', hint: 'this current has returned' }
    : recommendAction(hasFragment, source, conditions, lastLine, !!resurface);

  // Internal compass: surface wind (immediate) + deep swell (pattern).
  const surfaceWind = inferSurfaceWind(fragment, lastLine, texture, source);
  const deepSwell = inferDeepSwell(currents, domBreak, source, tidePhase, sortedDesc.length);

  // Real-world break the inner conditions most resemble.
  const resemblance = inferBreak({
    swellHeight,
    swellHeightHigh,
    period,
    texture,
    tidePhase,
    source,
    conditions,
  });

  // Reading: explain the signal in surf-forecaster language.
  const reading = buildReading({
    fragmentLen: fragment.text.length,
    lastLine,
    nowSec,
    recentCluster,
    fragment,
    source,
    sortedDesc,
  });

  // Bar series: show recent rhythm. Each bar = one of the last 7 time
  // buckets (~4h each). Height = saves in that bucket, normalised.
  const bucketHours = 4;
  const series = Array.from({ length: 7 }, (_, i) => {
    const bucketEnd = nowSec - i * bucketHours * hour;
    const bucketStart = bucketEnd - bucketHours * hour;
    const c = sortedDesc.filter(
      (l) => l.created_at > bucketStart && l.created_at <= bucketEnd
    ).length;
    return c;
  }).reverse();
  const peak = Math.max(1, ...series);
  const normalised = series.map((c) =>
    Math.max(0.18, Math.min(1, 0.25 + (c / peak) * 0.75))
  );

  return {
    swellHeight,
    swellHeightHigh,
    period,
    direction,
    texture,
    tidePhase,
    tideLevel,
    confidence,
    conditions,
    phrase,
    reading,
    source,
    action,
    series: normalised,
    resurface: echo ? echo.line : resurface,
    currents,
    interpretive,
    echo,
    surfaceWind,
    deepSwell,
    resemblance,
  };
}

// Build a short 2–3-clause reading sentence in surf-forecaster cadence.
function buildReading(args: {
  fragmentLen: number;
  lastLine: Line | null;
  nowSec: number;
  recentCluster: number;
  fragment: FragmentContext;
  source: ForecastSource;
  sortedDesc: Line[];
}): string {
  const { fragmentLen, lastLine, nowSec, recentCluster, fragment, source, sortedDesc } = args;
  const parts: string[] = [];

  // last save freshness
  if (lastLine) {
    const ageH = (nowSec - lastLine.created_at) / 3600;
    if (ageH < 1) parts.push('last line still warm');
    else if (ageH < 6) parts.push(`last line ${Math.max(1, Math.round(ageH))}h ago`);
    else if (ageH < 24) parts.push('quiet since this morning');
    else if (ageH < 72) parts.push(`${Math.round(ageH / 24)}d since the last set`);
    else parts.push('long stretch of open water');
  }

  // fragment status
  if (fragmentLen > 0) {
    parts.push('unfinished fragment holding shape');
  }

  // clustering
  if (recentCluster >= 3) parts.push('lines surfacing close together');
  else if (recentCluster === 2) parts.push('two lines arrived in one set');

  // tag context
  if (fragment.tide || lastLine?.tide) {
    parts.push(`tide · ${(fragment.tide ?? lastLine?.tide)!.toLowerCase()}`);
  } else if (fragment.terrain || lastLine?.terrain) {
    parts.push(`terrain · ${(fragment.terrain ?? lastLine?.terrain)!.toLowerCase()}`);
  }

  // mode rhythm — what mode have recent lines been?
  const recentModes = tally(sortedDesc.slice(0, 5).map((l) => l.mode));
  const topMode = topOf(recentModes);
  if (topMode && topMode.count >= 2 && topMode.key !== 'fragment') {
    parts.push(`recent runs in ${topMode.key}`);
  }

  // source signal as the closer
  parts.push(`source · ${source}`);

  return parts.slice(0, 4).join(' · ');
}

// Stable-ish hash to seed phrase/direction selection without the wall clock.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ─── current reading (for tag-filtered Depth Stack) ──────────────────────────

export type CurrentReading = {
  /** poetic name for this current */
  title: string;
  /** one-line description */
  description: string;
  /** mode tally */
  topModes: Array<{ key: LineMode; count: number }>;
  /** strongest co-occurring tag */
  coTag: string | null;
  /** recommended writing move for this current */
  action: ForecastAction;
};

export function readCurrent(
  filterKind: 'tide' | 'terrain' | 'constellation' | 'topic' | 'mode',
  filterValue: string,
  filteredLines: Line[],
  nowSec: number = Math.floor(Date.now() / 1000),
): CurrentReading {
  const total = filteredLines.length;
  const favCount = filteredLines.filter((l) => l.is_favorite === 1).length;
  const lastTs = lastTime(filteredLines);
  const ageDays = lastTs ? (nowSec - lastTs) / 86400 : Infinity;

  const topModes = tally(filteredLines.map((l) => l.mode))
    .filter((m) => m.key !== 'fragment')
    .slice(0, 3);

  // co-occurring tag — most common of the *other* tag kinds within this slice.
  const coCandidates: Array<{ kind: string; value: string }> = [];
  for (const l of filteredLines) {
    if (filterKind !== 'tide' && l.tide) coCandidates.push({ kind: 'tide', value: l.tide });
    if (filterKind !== 'terrain' && l.terrain) coCandidates.push({ kind: 'terrain', value: l.terrain });
    if (filterKind !== 'constellation' && l.constellation) coCandidates.push({ kind: 'constellation', value: l.constellation });
  }
  const coTally = tally(coCandidates.map((c) => `${c.kind}:${c.value}`));
  const coTag = coTally.length > 0 ? coTally[0].key : null;

  // Title: borrows the filter value but in current/forecast voice.
  const titlePrefix = filterKind === 'tide' ? '' :
                      filterKind === 'terrain' ? 'terrain · ' :
                      filterKind === 'constellation' ? 'with · ' :
                      filterKind === 'mode' ? 'run of ' :
                      'topic · ';
  const title = `${titlePrefix}${filterValue}`;

  // Description in surfline cadence.
  const parts: string[] = [];
  if (filterKind === 'tide') {
    if (/low tide|dead calm/i.test(filterValue)) parts.push('deep pull, low visibility');
    else if (/storm front|building chop|heavy current/i.test(filterValue)) parts.push('strong set, hold on');
    else if (/glass water|slack water|golden hour|offshore/i.test(filterValue)) parts.push('glass — long sight lines');
    else parts.push('a steady current');
  } else if (filterKind === 'terrain') {
    if (/sharp|hardened/i.test(filterValue)) parts.push('hard ground · short rides');
    else if (/restless/i.test(filterValue)) parts.push('cross-chop · keep lines short');
    else if (/still|porous|tender/i.test(filterValue)) parts.push('soft bottom · long carries');
    else parts.push('mixed bottom');
  } else if (filterKind === 'constellation') {
    parts.push('a named presence in the water');
  } else if (filterKind === 'mode') {
    parts.push(`${filterValue} runs`);
  } else {
    parts.push('a recurring topic');
  }

  if (topModes.length > 0) {
    parts.push(`mostly ${topModes.map((m) => m.key).slice(0, 2).join('/')}`);
  }
  if (favCount > 0) {
    parts.push(`${favCount} kept close`);
  }
  if (ageDays === Infinity) {
    parts.push('no lines yet');
  } else if (ageDays < 1) {
    parts.push('warm');
  } else if (ageDays < 7) {
    parts.push(`${Math.max(1, Math.round(ageDays))}d since last`);
  } else {
    parts.push('cold trail');
  }

  const description = parts.join(' · ');

  // Action: choppy/restless → sharpen; quiet/old → reshape; otherwise open.
  let action: ForecastAction;
  if (filterKind === 'tide' && /storm front|building chop|heavy current/i.test(filterValue)) {
    action = { kind: 'shape', mode: 'aphorism', label: 'sharpen this current →', hint: 'compress before it slips' };
  } else if (filterKind === 'terrain' && /sharp|hardened|restless/i.test(filterValue)) {
    action = { kind: 'shape', mode: 'aphorism', label: 'sharpen one →', hint: 'one line, sharpened' };
  } else if (ageDays > 7) {
    action = { kind: 'reshape', mode: 'aphorism', label: 'reshape oldest →', hint: 'pull a line up from below' };
  } else if (topModes[0]?.key === 'paradox') {
    action = { kind: 'shape', mode: 'paradox', label: 'paradox again →', hint: 'this current runs paradox' };
  } else if (topModes[0]?.key === 'contradiction') {
    action = { kind: 'shape', mode: 'contradiction', label: 'name the split →', hint: 'this current runs contradiction' };
  } else if (topModes[0]?.key === 'aside') {
    action = { kind: 'shape', mode: 'aside', label: 'another aside →', hint: 'this current runs slanted' };
  } else {
    action = { kind: 'reshape', mode: 'aside', label: 'turn this sideways →', hint: 'try an aside on this current' };
  }

  return { title, description, topModes, coTag, action };
}
