// Internal line intelligence.
//
// Pure, lightweight signal extraction over raw fragment / line text and the
// surrounding session state (forecast, live break match, saved-line history,
// active tags). Output is a compact `LineSignals` object plus a recommended
// Verso mode among the four supported modes (paradox, aphorism, contradiction,
// aside).
//
// Nothing here is exposed as UI — these signals exist to make recommendation,
// generation context, and local fallback selection smarter without adding
// any visible controls. A small quality-scoring helper rejects motivational
// / therapy / quote-card phrasing in local fallbacks.
//
// No persistence, no network, no new dependencies. Pure functions.
//
// Mode scope (do not extend beyond these four):
//   paradox        — two truths in tension, a hinge that does not resolve
//   aphorism       — short declarative, image-led, portable
//   contradiction  — belief vs behavior, an exposed split
//   aside          — slanted dry-witted observation, idiosyncratic register

import type { Line, LineMode } from './db/database';
import type { VersoMode } from './theme';

// ─── signals ────────────────────────────────────────────────────────────────

export type LineSignals = {
  /** word count (≤14 = aphoristic-compressible) */
  wordCount: number;
  /** char count of trimmed input */
  charCount: number;
  /** ends in a question mark */
  isQuestion: boolean;

  // hinge / structure signals
  /** "and yet", "even as", "the more X the less Y", etc. */
  hasParadoxHinge: boolean;
  /** "I say / promised … but / yet …" — belief vs action */
  hasBeliefVsBehavior: boolean;
  /** mirror structure ("the more the less", "the closer the further") */
  hasMirror: boolean;
  /** comma- or em-dash-driven turn — pivot mid-line */
  hasTurn: boolean;

  // semantic pressures (any one boosts a specific mode)
  /** desire/want/longing language */
  longingPressure: number;
  /** body / physical pressure (ache, weight, breath, hunger) */
  bodyPressure: number;
  /** memory / return / "again" / "still" / "keep" */
  memoryReturn: number;
  /** social / scene / customer-service style register */
  socialCharge: number;
  /** image density — concrete nouns and specifics */
  imageDensity: number;
  /** wit potential — first person + ironic register */
  witPotential: number;
  /** absence / refusal / "no" / "can't" */
  refusalAbsence: number;
  /** threshold — "almost", "about to", "before", "still" */
  threshold: number;
  /** deflection — abstraction, vague pronouns, generic verbs */
  deflection: number;
  /** split desire — "want X and Y", contradictory desires */
  splitDesire: number;
};

const RE = {
  paradoxHinge: /\b(and yet|even as|while|though|despite|the more\b.*\bthe (less|further|harder|softer|smaller))\b/i,
  beliefVsBehavior: /\b(say|told|promise|swear|claim|wanted|love|hate|miss|hope)\b.*\b(but|yet|then)\b.*\b(do|don't|did|didn't|keep|never|always|still)\b/i,
  beliefVsBehaviorSimple: /\bi (say|told|promise|swear|claim)\b.*\b(but|yet)\b/i,
  mirror: /\bthe (more|closer|harder|longer|fewer|smaller)\b.*\b(less|further|shorter|softer|smaller|bigger|larger)\b/i,
  turn: /[—–,;]\s+(but|yet|still|though|and yet)\b/i,

  longing: /\b(want(ed)?|wish(ed)?|long(ing|ed)?|crave|miss(ed)?|need(ed)?|ache for)\b/i,
  body: /\b(ache|weight|breath|hunger|tongue|spine|skin|pulse|heat|chill|knees|chest|throat|stomach|tired|sleep)\b/i,
  memory: /\b(remember(ed)?|forgot|again|still|keep|kept|return(ing|ed)?|back to|years ago|before|used to)\b/i,
  social: /\b(customer|service|email|inbox|meeting|office|coworker|landlord|stranger|register|receipt|line at|appointment|paperwork|refund|deposit|invoice)\b/i,
  refusal: /\b(no\b|never|won't|can't|cannot|refuse|stopped|stop|quit|left|leave)\b/i,
  threshold: /\b(almost|about to|just before|still not|on the edge|at the door|nearly|hovering|threshold)\b/i,
  splitDesire: /\b(want).*\b(and|but)\b.*\b(also|other|different|opposite|quieter|louder|both)\b/i,
  abstract: /\b(authenticity|self-?care|trauma|boundaries|journey|healing|warrior|blessed|embrace|showing up|truth|love|life|hope)\b/i,
  firstPerson: /\bi\b/i,
  ironicRegister: /\b(though we were|on speaking terms|barely|technically|allegedly|apparently|eventually|reluctantly|by appointment|in correspondence|by mail|customer service|paperwork|receipts?)\b/i,

  // image density: count concrete nouns of common categories
  concrete: /\b(kitchen|window|door|chair|coffee|rain|snow|train|bus|car|phone|letter|drawer|street|hallway|garden|mirror|knife|bread|salt|wine|book|table|hour|morning|evening|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|hand|face|hair|eyes|knees|skin)\b/gi,
};

function countMatches(re: RegExp, text: string): number {
  if (!re.global) {
    return re.test(text) ? 1 : 0;
  }
  const m = text.match(re);
  return m ? m.length : 0;
}

export function extractSignals(text: string): LineSignals {
  const t = (text || '').trim();
  const words = t.split(/\s+/).filter(Boolean);
  const lower = t.toLowerCase();

  return {
    wordCount: words.length,
    charCount: t.length,
    isQuestion: /\?\s*$/.test(t),

    hasParadoxHinge: RE.paradoxHinge.test(lower),
    hasBeliefVsBehavior:
      RE.beliefVsBehavior.test(lower) || RE.beliefVsBehaviorSimple.test(lower),
    hasMirror: RE.mirror.test(lower),
    hasTurn: RE.turn.test(lower),

    longingPressure: RE.longing.test(lower) ? 1 : 0,
    bodyPressure: RE.body.test(lower) ? 1 : 0,
    memoryReturn: RE.memory.test(lower) ? 1 : 0,
    socialCharge: RE.social.test(lower) ? 1 : 0,
    imageDensity: Math.min(3, countMatches(RE.concrete, t)),
    witPotential:
      (RE.firstPerson.test(t) ? 1 : 0) + (RE.ironicRegister.test(lower) ? 1 : 0),
    refusalAbsence: RE.refusal.test(lower) ? 1 : 0,
    threshold: RE.threshold.test(lower) ? 1 : 0,
    deflection: RE.abstract.test(lower) ? 1 : 0,
    splitDesire: RE.splitDesire.test(lower) ? 1 : 0,
  };
}

// ─── mode recommendation ────────────────────────────────────────────────────

export type ModeScore = Record<VersoMode, number>;

export type RecommendContext = {
  /** active tags on the fragment / drift */
  tide?: string | null;
  terrain?: string | null;
  constellation?: string | null;
  /** forecast source label, if available */
  forecastSource?: string | null;
  /** live-break archetype (heavy/long/punchy/soft/open), if available */
  liveArchetype?: string | null;
  /** dominant break across recent saved lines */
  dominantMode?: LineMode | null;
  /** the user's recently saved Verso modes (most-recent first) */
  recentModes?: LineMode[];
};

const VALID_VERSO: ReadonlyArray<VersoMode> = [
  'paradox',
  'aphorism',
  'contradiction',
  'aside',
];

export function isVersoMode(m: string | null | undefined): m is VersoMode {
  return !!m && (VALID_VERSO as readonly string[]).includes(m);
}

/** Score each of the four modes against text + signals + context. */
export function scoreModes(
  signals: LineSignals,
  ctx: RecommendContext = {},
): ModeScore {
  const score: ModeScore = {
    paradox: 0,
    aphorism: 0,
    contradiction: 0,
    aside: 0,
  };

  // Paradox: hinge + two-truth tension
  if (signals.hasParadoxHinge) score.paradox += 3;
  if (signals.hasMirror) score.paradox += 3;
  if (signals.hasTurn) score.paradox += 1;
  if (signals.threshold) score.paradox += 1;

  // Contradiction: belief vs behavior, split desire
  if (signals.hasBeliefVsBehavior) score.contradiction += 3;
  if (signals.splitDesire) score.contradiction += 2;
  if (signals.refusalAbsence && signals.longingPressure) score.contradiction += 2;
  if (signals.deflection) score.contradiction += 1; // pretty words, vague action

  // Aphorism: short, declarative, concrete, no question
  if (
    signals.wordCount >= 4 &&
    signals.wordCount <= 14 &&
    !signals.isQuestion
  ) {
    score.aphorism += 2;
  }
  if (signals.imageDensity >= 1) score.aphorism += 1;
  if (signals.imageDensity >= 2) score.aphorism += 1;

  // Aside: first person + ironic / social register
  if (signals.witPotential >= 2) score.aside += 3;
  if (signals.witPotential >= 1 && signals.socialCharge) score.aside += 2;
  if (signals.witPotential >= 1 && signals.imageDensity >= 1) score.aside += 1;

  // Context boosts
  const terrain = (ctx.terrain || '').toLowerCase();
  const tide = (ctx.tide || '').toLowerCase();
  if (/sharp|hardened/.test(terrain)) score.contradiction += 1;
  if (/restless|narrow/.test(terrain)) score.aphorism += 1;
  if (/tender|porous|still/.test(terrain)) score.aside += 1;
  if (/storm|chop|heavy/.test(tide)) score.aphorism += 1; // sharpen before it slips
  if (/glass|slack|golden|offshore/.test(tide)) score.aphorism += 1;

  if (ctx.forecastSource === 'contradiction') score.contradiction += 2;
  if (ctx.forecastSource === 'returning memory') score.aside += 1;
  if (ctx.forecastSource === 'body pressure') score.contradiction += 1;
  if (ctx.forecastSource === 'fresh swell') score.paradox += 1;

  if (ctx.liveArchetype === 'heavy') score.contradiction += 1;
  if (ctx.liveArchetype === 'long') score.paradox += 1;
  if (ctx.liveArchetype === 'punchy') score.aphorism += 1;
  if (ctx.liveArchetype === 'soft') score.aside += 1;

  // Slight nudge AWAY from a mode the user just used twice in a row, so
  // we don't lock them into one register.
  const recent = (ctx.recentModes || []).filter((m): m is VersoMode =>
    isVersoMode(m as string),
  );
  if (recent.length >= 2 && recent[0] === recent[1]) {
    const m = recent[0];
    score[m] = Math.max(0, score[m] - 1);
  }

  // Dominant mode is a *small* nudge — preserves the user's current voice.
  if (isVersoMode(ctx.dominantMode as string)) {
    score[ctx.dominantMode as VersoMode] += 0.5;
  }

  return score;
}

export function recommendMode(
  text: string,
  ctx: RecommendContext = {},
  fallback: VersoMode = 'aphorism',
): VersoMode {
  const t = (text || '').trim();
  if (t.length < 4) return fallback;
  const sig = extractSignals(t);
  const s = scoreModes(sig, ctx);
  let best: VersoMode = fallback;
  let bestScore = -Infinity;
  for (const m of VALID_VERSO) {
    if (s[m] > bestScore) {
      bestScore = s[m];
      best = m;
    }
  }
  // Tiebreak: prefer the recommendation only if it's clearly above the floor.
  if (bestScore <= 0) return fallback;
  return best;
}

// ─── quality / anti-cliché scoring ──────────────────────────────────────────
//
// Cheap penalty score for a generated/local fallback line. Lower = better.
// Used to filter local fallback candidates and to choose between two retries
// of a server response when the server is unavailable. Never blocks the user.

const CLICHE_PATTERNS = [
  /\bremember\b/i,
  /\bembrace\b/i,
  /\bjourney\b/i,
  /\bwarrior\b/i,
  /\bblessed\b/i,
  /\bwe all\b/i,
  /\bis the new\b/i,
  /\bself[- ]?care\b/i,
  /\bauthenticity\b/i,
  /\bshowing up\b/i,
  /\bhealing\b/i,
  /\btrauma\b/i,
  /\bboundaries\b/i,
  /\byou got this\b/i,
  /\blive,? laugh\b/i,
  /\beveryday is\b/i,
  /\bbe yourself\b/i,
  /\binner child\b/i,
];

// Patterns that read as forced setup-and-punchline jokes.
const FORCED_JOKE_PATTERNS = [
  /\bwhy is it that\b/i,
  /\banyone else\b/i,
  /\bam i right\b/i,
  /\bjust me\b\??/i,
  /\bclassic\b\.?$/i,
];

export type QualityScore = {
  /** total penalty — 0 is clean, higher is worse */
  penalty: number;
  reasons: string[];
};

export function scoreQuality(line: string, mode?: VersoMode): QualityScore {
  const reasons: string[] = [];
  let p = 0;
  const t = (line || '').trim();
  if (!t) return { penalty: 100, reasons: ['empty'] };

  // length
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words > 24) { p += 3; reasons.push('over-long'); }
  else if (words > 18) { p += 1; reasons.push('long'); }
  if (words < 3) { p += 2; reasons.push('thin'); }

  // generic openings
  if (/^(life is|love is|hope is|truth is|pain is)\b/i.test(t)) {
    p += 2;
    reasons.push('generic-opening');
  }

  // therapy / motivational / quote-card
  for (const re of CLICHE_PATTERNS) {
    if (re.test(t)) {
      p += 2;
      reasons.push('cliche');
      break;
    }
  }

  // forced jokes (penalised everywhere, including aside — wit ≠ punchline)
  for (const re of FORCED_JOKE_PATTERNS) {
    if (re.test(t)) {
      p += 2;
      reasons.push('forced-joke');
      break;
    }
  }

  // over-explained — chained "because" or trailing moralising
  if (/\bbecause\b.*\bbecause\b/i.test(t)) {
    p += 1;
    reasons.push('over-explained');
  }
  if (/\bremember[,:]?\s/i.test(t)) {
    p += 1;
    reasons.push('moralising');
  }

  // trailing emoji / hashtag / quote marks
  if (/[#@]/.test(t)) { p += 1; reasons.push('hashtag'); }
  if (/[\u{1F300}-\u{1FAFF}]/u.test(t)) { p += 1; reasons.push('emoji'); }
  if (/^["“'']/.test(t) || /["”'']$/.test(t)) {
    p += 0.5;
    reasons.push('quoted');
  }

  // mode-specific contracts
  if (mode === 'paradox') {
    const sig = extractSignals(t);
    if (!sig.hasParadoxHinge && !sig.hasMirror && !sig.hasTurn) {
      p += 1.5;
      reasons.push('no-hinge');
    }
  }
  if (mode === 'aphorism') {
    if (words > 14) { p += 1.5; reasons.push('aphorism-too-long'); }
    if (/\?\s*$/.test(t)) { p += 1; reasons.push('aphorism-as-question'); }
  }
  if (mode === 'contradiction') {
    const sig = extractSignals(t);
    if (!sig.hasBeliefVsBehavior && !sig.splitDesire) {
      p += 0.5;
      reasons.push('weak-contradiction');
    }
    if (/\bbut they\b|\beveryone\b/i.test(t)) {
      p += 1;
      reasons.push('finger-wagging');
    }
  }
  if (mode === 'aside') {
    // wit fails most often as a stand-up punchline — penalise rhetorical-Q form
    if (/\?\s*$/.test(t)) { p += 1; reasons.push('aside-as-question'); }
    if (/!$/.test(t)) { p += 1; reasons.push('exclaimed'); }
  }

  return { penalty: p, reasons };
}

/** Pick the best of N candidates (lowest penalty, with tiebreak on length). */
export function pickBest(
  candidates: string[],
  mode?: VersoMode,
  exclude?: string,
): string | null {
  const pool = candidates
    .map((s) => (s || '').trim())
    .filter((s) => s.length > 0 && s !== (exclude || '').trim());
  if (pool.length === 0) return null;
  let best: { line: string; score: number; len: number } | null = null;
  for (const line of pool) {
    const { penalty } = scoreQuality(line, mode);
    const len = line.length;
    if (
      !best ||
      penalty < best.score ||
      (penalty === best.score && Math.abs(len - 80) < Math.abs(best.len - 80))
    ) {
      best = { line, score: penalty, len };
    }
  }
  return best ? best.line : null;
}

// ─── user-voice profile ─────────────────────────────────────────────────────
//
// Lightweight inference from saved lines (favourites weighted higher).
// Used internally to bias generation context and fallback selection — no UI.

export type VoiceProfile = {
  /** preferred line length in words (median of saved non-fragment lines) */
  preferredLength: number;
  /** preferred mode among the four (most common, otherwise null) */
  preferredMode: VersoMode | null;
  /** how often saved lines start with "I" */
  firstPersonRate: number;
  /** dryness — fraction of lines with ironic / social register */
  dryness: number;
  /** darkness — fraction of lines with refusal / absence / body pressure */
  darkness: number;
  /** how often saved lines carry an explicit hinge (paradox/contradiction structures) */
  hingeRate: number;
  /** compact list of style-hint tokens for the prompt context channel */
  styleTokens: string[];
};

export function emptyVoiceProfile(): VoiceProfile {
  return {
    preferredLength: 12,
    preferredMode: null,
    firstPersonRate: 0,
    dryness: 0,
    darkness: 0,
    hingeRate: 0,
    styleTokens: [],
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function inferVoiceProfile(lines: Line[]): VoiceProfile {
  // Prefer favourites, fall back to non-fragment shaped lines, then everything.
  const favs = lines.filter((l) => l.is_favorite === 1 && l.is_seed !== 1);
  const shaped = lines.filter(
    (l) => l.mode !== 'fragment' && l.is_seed !== 1,
  );
  const sample =
    favs.length >= 3 ? favs : shaped.length >= 3 ? shaped : lines.slice(0, 20);
  if (sample.length === 0) return emptyVoiceProfile();

  const lengths: number[] = [];
  let firstPerson = 0;
  let dry = 0;
  let dark = 0;
  let hinge = 0;
  const modeCounts = new Map<VersoMode, number>();

  for (const l of sample) {
    const t = (l.content || '').trim();
    if (!t) continue;
    const wc = t.split(/\s+/).filter(Boolean).length;
    lengths.push(wc);
    const sig = extractSignals(t);
    if (/^i\b/i.test(t)) firstPerson += 1;
    if (sig.witPotential >= 2 || sig.socialCharge) dry += 1;
    if (sig.refusalAbsence || sig.bodyPressure) dark += 1;
    if (sig.hasParadoxHinge || sig.hasMirror || sig.hasBeliefVsBehavior) hinge += 1;
    if (isVersoMode(l.mode as string)) {
      const m = l.mode as VersoMode;
      modeCounts.set(m, (modeCounts.get(m) ?? 0) + 1);
    }
  }

  let preferredMode: VersoMode | null = null;
  let topCount = 0;
  for (const [m, c] of modeCounts) {
    if (c > topCount) {
      preferredMode = m;
      topCount = c;
    }
  }

  const tokens: string[] = [];
  const firstPersonRate = firstPerson / sample.length;
  const dryness = dry / sample.length;
  const darkness = dark / sample.length;
  const hingeRate = hinge / sample.length;
  const preferredLength = Math.max(4, Math.min(20, Math.round(median(lengths) || 12)));

  if (firstPersonRate > 0.5) tokens.push('first-person');
  if (dryness > 0.3) tokens.push('dry-witted');
  if (darkness > 0.3) tokens.push('darker');
  if (hingeRate > 0.4) tokens.push('hinge-prone');
  if (preferredLength <= 10) tokens.push('short');
  else if (preferredLength >= 16) tokens.push('long');

  return {
    preferredLength,
    preferredMode,
    firstPersonRate,
    dryness,
    darkness,
    hingeRate,
    styleTokens: tokens,
  };
}

// ─── compact context packet ─────────────────────────────────────────────────
//
// Builds the GenerateContext payload for /api/generate. Same shape as the
// existing `GenerateContext` in src/llm.ts; constructing it here keeps the
// "what the model sees" logic in one place.

export type CompactContext = {
  tide?: string | null;
  terrain?: string | null;
  constellation?: string | null;
  lexicon?: string[];
  currents?: string[];
  dominantBreak?: string | null;
  styleHints?: string[];
};

export function buildContextPacket(args: {
  tide?: string | null;
  terrain?: string | null;
  constellation?: string | null;
  lexicon?: string[];
  currents?: string[];
  dominantMode?: LineMode | null;
  voiceTokens?: string[];
  forecastSource?: string | null;
  liveBreak?: string | null;
  liveArchetype?: string | null;
  recommendedMode?: VersoMode | null;
  styleHints?: string[];
}): CompactContext {
  const styleHints: string[] = [];
  if (args.voiceTokens) styleHints.push(...args.voiceTokens);
  if (args.styleHints) styleHints.push(...args.styleHints);
  if (args.forecastSource) styleHints.push(`source:${args.forecastSource}`);
  if (args.liveBreak) styleHints.push(`live:${args.liveBreak}`);
  if (args.liveArchetype) styleHints.push(`flavor:${args.liveArchetype}`);
  if (args.recommendedMode) styleHints.push(`recommend:${args.recommendedMode}`);

  // Cap to 8 tokens; the server will truncate further but trimming early
  // keeps logs and request bodies compact.
  const compactStyle = Array.from(new Set(styleHints)).slice(0, 8);

  return {
    tide: args.tide ?? null,
    terrain: args.terrain ?? null,
    constellation: args.constellation ?? null,
    lexicon: args.lexicon?.slice(0, 8),
    currents: args.currents?.slice(0, 4),
    dominantBreak: args.dominantMode ?? null,
    styleHints: compactStyle,
  };
}

// ─── safe fallback selection ────────────────────────────────────────────────

/**
 * Pick the best local fallback for a mode given a small bank, optionally
 * avoiding a previous line and biasing toward the user's voice profile.
 * Quality scoring filters out anything that smells like a cliché.
 */
export function pickFallback(
  bank: ReadonlyArray<string>,
  mode: VersoMode,
  opts?: { exclude?: string; voice?: VoiceProfile },
): string | null {
  if (!bank || bank.length === 0) return null;
  const exclude = (opts?.exclude || '').trim();
  const voice = opts?.voice;

  // First pass — reject anything with non-trivial penalty.
  const clean = bank.filter((l) => {
    if (!l || l.trim() === exclude) return false;
    const { penalty } = scoreQuality(l, mode);
    return penalty <= 1;
  });
  const pool = (clean.length ? clean : bank).filter(
    (l) => !!l && l.trim() !== exclude,
  );
  if (pool.length === 0) return null;

  // Second pass — score and prefer ones near the voice's preferred length
  // and matching first-person preference.
  let best: { line: string; score: number } | null = null;
  for (const candidate of pool) {
    const { penalty } = scoreQuality(candidate, mode);
    const wc = candidate.trim().split(/\s+/).filter(Boolean).length;
    let bias = penalty;
    if (voice) {
      bias += Math.abs(wc - voice.preferredLength) / 12;
      const startsWithI = /^i\b/i.test(candidate.trim());
      if (voice.firstPersonRate > 0.5 && !startsWithI) bias += 0.3;
      if (voice.firstPersonRate < 0.2 && startsWithI) bias += 0.2;
      if (voice.dryness > 0.4 && mode === 'aside') bias -= 0.2;
    }
    if (!best || bias < best.score) {
      best = { line: candidate, score: bias };
    }
  }
  return best ? best.line : null;
}
