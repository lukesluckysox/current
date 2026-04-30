// Minimal Node/Express API for Current.
// - Serves the Expo static web export from /dist with SPA fallback.
// - Exposes POST /api/generate which calls Anthropic for aphorism / paradox /
//   contradiction generation, /api/edit for clearer/sharper/stranger rewrites,
//   and /api/why-break for a one-line recommendation. The Anthropic API key is
//   server-only and is never exposed to the client.
//
// Required env (server-only):
//   ANTHROPIC_API_KEY   Anthropic key. Required for /api/* generation routes.
// Optional:
//   LLM_MODEL           Claude model id. Defaults to a fast Claude model.
//   LLM_RATE_LIMIT_PER_MIN  Per-IP requests/minute. Default 30.
//   PORT                Port to listen on. Default 3000.

const path = require('path');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { initDb, isDbConfigured, isAuthRequired, authMiddleware, requireAuth, mountAuthRoutes } = require('./auth');

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001';
const RATE_LIMIT_PER_MIN = Number(process.env.LLM_RATE_LIMIT_PER_MIN) || 30;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const MAX_SEED_LEN = 280;
const MAX_LINE_LEN = 220;
const MAX_OUTPUT_TOKENS = 120;
const REQUEST_TIMEOUT_MS = 8000;

const VALID_TYPES = new Set(['aphorism', 'paradox', 'contradiction', 'aside']);
const VALID_EDIT_OPS = new Set(['clearer', 'sharper', 'stranger']);
const VALID_BOARDS = new Set([
  'confession', 'image', 'question', 'memory',
  'contradiction', 'threshold', 'return',
]);
const BOARD_HINTS = {
  confession:    'an admission spoken quietly to one person, never as therapy',
  image:         'a single concrete picture — light, room, weather, body, object',
  question:      'a question with no comfortable answer; not rhetorical',
  memory:        'a small remembered specific — a smell, room, sentence, hour',
  contradiction: 'two truths pulling against each other inside one line',
  threshold:     'the suspended hour just before something changes',
  return:        'a thing the speaker keeps coming back to without choosing',
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));
app.use(authMiddleware);
mountAuthRoutes(app);

// Tiny in-memory rate limiter, keyed by client IP. Sliding window of 60s.
// Best-effort — multi-instance Railway deploys won't share state, but it slows
// obvious abuse from a single IP.
const buckets = new Map();
function rateLimit(req, res, next) {
  const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) ||
    req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (buckets.get(ip) || []).filter((t) => t > windowStart);
  if (arr.length >= RATE_LIMIT_PER_MIN) {
    res.set('Retry-After', '60');
    return res.status(429).json({ error: 'rate_limited' });
  }
  arr.push(now);
  buckets.set(ip, arr);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || v[v.length - 1] < windowStart) buckets.delete(k);
    }
  }
  next();
}

// ─── Prompt construction ─────────────────────────────────────────────────────

function systemPrompt() {
  return [
    'You write a single short line for a creative writing instrument called Current.',
    'Voice: terse, image-led, contemporary, exact. Strong verbs, concrete nouns, specific particulars over abstractions.',
    'Pursue ingenuity: prefer the angle a careful writer would choose on the third try, not the first. Surprise without straining.',
    'Pressure point: find the contradiction, the avoided admission, the hidden bargain, the almost-said thing, the gap between tone and content. Generate from that pressure, not from the surface topic.',
    'Forbidden: motivational-poster tone, self-help clichés, TED-talk cadence, "remember", "embrace", "journey", "warrior", "blessed", "we all", "is the new", second-person commands, rhetorical questions, emojis, hashtags, quotation marks, attributions, explanations, preambles, trailing moralizing, therapy vocabulary ("trauma", "boundaries", "authenticity", "self-care", "healing journey", "showing up").',
    'Output exactly one line, under 20 words, no paragraph break, no leading dash/number/label. No trailing period required.',
  ].join(' ');
}

// Build a compact, anonymous context block. Truncates aggressively. Never
// echoes raw user lines into logs and never includes more than ~6 short hints.
function contextBlock(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const parts = [];
  if (typeof ctx.tide === 'string' && ctx.tide.trim()) {
    parts.push(`tide: ${ctx.tide.trim().slice(0, 40)}`);
  }
  if (typeof ctx.terrain === 'string' && ctx.terrain.trim()) {
    parts.push(`terrain: ${ctx.terrain.trim().slice(0, 40)}`);
  }
  if (typeof ctx.constellation === 'string' && ctx.constellation.trim()) {
    parts.push(`with: ${ctx.constellation.trim().slice(0, 40)}`);
  }
  if (Array.isArray(ctx.lexicon) && ctx.lexicon.length) {
    const top = ctx.lexicon.filter((w) => typeof w === 'string').slice(0, 6).map((w) => w.trim().toLowerCase().slice(0, 24)).filter(Boolean);
    if (top.length) parts.push(`recurring words: ${top.join(', ')}`);
  }
  if (Array.isArray(ctx.currents) && ctx.currents.length) {
    const c = ctx.currents.filter((w) => typeof w === 'string').slice(0, 4).map((w) => w.trim().toLowerCase().slice(0, 32)).filter(Boolean);
    if (c.length) parts.push(`returning currents: ${c.join(' · ')}`);
  }
  if (typeof ctx.dominantBreak === 'string' && /^(aphorism|paradox|contradiction|aside|fragment|complete|distill|invert)$/.test(ctx.dominantBreak)) {
    parts.push(`recent break: ${ctx.dominantBreak}`);
  }
  if (Array.isArray(ctx.styleHints) && ctx.styleHints.length) {
    const s = ctx.styleHints.filter((w) => typeof w === 'string').slice(0, 8).map((w) => w.trim().toLowerCase().slice(0, 32)).filter(Boolean);
    if (s.length) parts.push(`style: ${s.join(', ')}`);
  }
  if (parts.length === 0) return '';
  return `\nContext (silent — do not name, quote, or list these): ${parts.join(' · ')}.`;
}

function userPrompt(type, seed, ctx) {
  const trimmed = (seed || '').trim().slice(0, MAX_SEED_LEN);
  const hasSeed = trimmed.length > 0;
  const ctxClause = contextBlock(ctx);
  const seedClause = hasSeed
    ? `\nHold this fragment in mind without quoting, naming, or paraphrasing it directly — let it sit underneath the line: ${trimmed}`
    : '\nNo seed was provided. Use the context (if any) and a small concrete anchor — kitchen, weather, transit, body, tool, room. Do not address or assume anything about the reader.';

  switch (type) {
    case 'aphorism':
      return [
        'Write one aphorism.',
        'Contract: a compressed, portable truth. Carved, final, stand-alone. Reads as if it has always existed.',
        'Shape: declarative. State the world, do not advise it. One concrete image or specific detail does the work; abstraction alone fails.',
        'Test: if the line could appear on a coffee mug, rewrite it. If it sounds like a quote-card, rewrite it. If a stranger could not repeat it from memory after one read, sharpen it.',
        'Forbidden here: "is the new ___", "the only ___ is ___", "true ___ is ___", lecturing, hedging, soft sentiment.',
        ctxClause,
        seedClause,
      ].join(' ');
    case 'paradox':
      return [
        'Write one paradox.',
        'Contract: two things that are both true and pull against each other. Tension stays alive at the end of the line — no neat resolution, no answer, no wink.',
        'Shape: a single sentence with a hinge ("and yet", "but", "the more... the less", "even as", "while"), or a clean turn mid-line. Concrete on both sides of the hinge.',
        'Test: if either half can be deleted without loss, it is not yet a paradox. If the line resolves the contradiction, remove the resolution.',
        'Forbidden here: riddle phrasing, "I am both X and Y", "everyone X but no one Y", clever oxymorons that collapse on inspection.',
        ctxClause,
        seedClause,
      ].join(' ');
    case 'contradiction':
      return [
        'Write one contradiction.',
        'Contract: expose a mismatch between belief / words / wants and behavior. Surface the hidden payoff, the avoidance, the performance, the fear disguised as virtue, the control disguised as care, the patience disguised as waiting. Bite without cruelty.',
        'Shape: concrete subject (often "I" or a small named role) and a small, observable behavior. The behavior is the punchline; do not explain it. Specificity over generality.',
        'Test: if the line preaches, cut it. If it could apply to "everyone", make the subject more specific. The reader should feel caught, not lectured. Strip any therapy or self-help vocabulary.',
        'Forbidden here: "but they say", "everyone wants X but nobody Y", finger-wagging, irony quotes, therapy vocabulary ("trauma", "boundaries", "authenticity", "showing up").',
        ctxClause,
        seedClause,
      ].join(' ');
    case 'aside':
      return [
        'Write one aside.',
        'Contract: a compact, slanted observation delivered with dry wit, mischief, or an idiosyncratic turn. The line tilts a familiar idea a few degrees off-axis so the reader catches its shape from the side. The wit comes from precision and tone, not from a punchline.',
        'Shape: usually first-person, declarative, lightly self-aware. One small concrete object, ritual, role, or transaction in the line. The slant lives in an unexpected pairing — pairing solitude with customer service, ambition with paperwork, grief with logistics, loyalty with refunds.',
        'Aim at this register, by example: "I wanted solitude with better customer service." / "I miss the old me, though we were barely on speaking terms."',
        'Test: if the line reads like a stand-up punchline, an internet sarcasm post, a motivational quote, therapy-speak, or a direct Groucho Marx imitation, rewrite it. If a stranger could not tell whether the speaker was kidding or not, you are close. Keep the wit dry; never wink.',
        'Forbidden here: setup-and-punchline jokes, observational-comedy cadence, "anyone else", "why is it that", emoji-flavored irony, motivational phrasing ("the trick is", "the secret is"), therapy vocabulary ("trauma", "boundaries", "authenticity", "showing up"), explicit Groucho impressions ("I would never join…"), rhetorical questions, exclamations.',
        ctxClause,
        seedClause,
      ].join(' ');
    default:
      return 'Write one short line.' + ctxClause + seedClause;
  }
}

// Mode-aware micro-instructions appended to each edit op. The user-visible
// label (clearer / sharper / stranger) stays the same, but the model is
// pointed at the contract of the active mode so the edit deepens rather than
// flattens the line.
const MODE_EDIT_CLAUSES = {
  paradox: {
    clearer:  'Make the hinge unmistakable, but keep both truths alive — do not resolve the tension.',
    sharper:  'Tighten the hinge. Strip explanation. Both halves must remain incompatible at the end of the line.',
    stranger: 'Find a stranger hinge or pairing. The two truths should still pull against each other; do not collapse one side.',
  },
  aphorism: {
    clearer:  'Compress to a portable, declarative line. State the world; do not advise it. Preserve the concrete image.',
    sharper:  'Cut to the bone. One concrete image, one clean verb. Remove every soft hedge. No second-person commands.',
    stranger: 'Find the angle a careful writer would reach on the third try — a more specific image, an unexpected pairing — without straining.',
  },
  contradiction: {
    clearer:  'Sharpen the split between belief / words and behavior. Name a specific small action. Do not lecture.',
    sharper:  'Tighten the gap between what is said and what is done. The behavior is the punchline; do not explain it.',
    stranger: 'Tilt the contradiction off-axis: a more specific role, ritual, or transaction that exposes the same split.',
  },
  aside: {
    clearer:  'Keep the slant. Make the dry observation land cleanly without becoming a punchline. Keep the speaker idiosyncratic.',
    sharper:  'Compress without flattening the wit. Drier, more idiosyncratic, never jokey. Avoid setup-and-punchline cadence.',
    stranger: 'Reach for a stranger pairing — solitude with paperwork, ambition with refunds, grief with logistics — without becoming a stand-up bit.',
  },
};

function modeEditClause(op, type) {
  if (!type || !MODE_EDIT_CLAUSES[type]) return '';
  const m = MODE_EDIT_CLAUSES[type];
  return m[op] ? ' ' + m[op] : '';
}

function editPrompt(op, line, type) {
  const t = (line || '').trim().slice(0, MAX_SEED_LEN);
  const breakHint = VALID_TYPES.has(type) ? ` It is a ${type}. Preserve that contract.` : '';
  const modeClause = VALID_TYPES.has(type) ? modeEditClause(op, type) : '';
  switch (op) {
    case 'clearer':
      return [
        'Rewrite the following line so its meaning lands on the first read, without losing edge or specificity.',
        'Keep the same length or shorter. Keep concrete imagery. Remove any abstraction that softens the line.',
        breakHint + modeClause,
        '\nLine:',
        t,
        '\nReturn only the rewritten line.',
      ].join(' ');
    case 'sharper':
      return [
        'Rewrite the following line sharper.',
        'Tighten the verb. Cut every unnecessary word. Keep the bite. Do not add new content; expose what is already there.',
        breakHint + modeClause,
        '\nLine:',
        t,
        '\nReturn only the rewritten line.',
      ].join(' ');
    case 'stranger':
      return [
        'Rewrite the following line so it tilts a few degrees off the obvious. Keep the same emotional core, but reach for an angle a careful writer would find on the third try.',
        'Use a more specific image, an unexpected pairing, or a turn that surprises without straining.',
        breakHint + modeClause,
        '\nLine:',
        t,
        '\nReturn only the rewritten line.',
      ].join(' ');
    default:
      return `Rewrite this line:\n${t}\nReturn only the rewritten line.`;
  }
}

// Prompt for generating fill-in-the-blank break skeletons for a board.
function breaksPrompt(board, count, ctx) {
  const hint = BOARD_HINTS[board] || '';
  const ctxClause = contextBlock(ctx);
  return [
    `Generate ${count} fill-in-the-blank skeletons (we call them "breaks") for the "${board}" board.`,
    `Posture of this board: ${hint}.`,
    'Each skeleton is one short line a writer can finish in seconds.',
    'Use a single underscore character with a space on each side ( _ ) to mark each blank. Two blanks max per line; one is often better.',
    'Voice: terse, image-led, contemporary, exact. Concrete nouns. No motivational tone, no therapy vocabulary, no quote-card cadence, no second-person commands, no rhetorical questions (unless this is the question board).',
    'Each skeleton must be useful as a starter — surprising, specific, and finishable. No quotation marks, no leading dashes or numbers.',
    'Output: exactly one skeleton per line, no blank lines, no commentary, no labels. Plain text.',
    ctxClause,
  ].join(' ');
}

// ─── Output handling ─────────────────────────────────────────────────────────

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
  /^live,? laugh/i,
  /\byou got this\b/i,
  /\bbe yourself\b/i,
  /\binner child\b/i,
  /\beveryday is\b/i,
  /\bthe trick is\b/i,
  /\bthe secret is\b/i,
];

const FORCED_JOKE_PATTERNS = [
  /\bwhy is it that\b/i,
  /\banyone else\b/i,
  /\bam i right\??$/i,
  /\bjust me\??$/i,
];

function isCliche(line, type) {
  if (!line) return true;
  if (CLICHE_PATTERNS.some((re) => re.test(line))) return true;
  if (FORCED_JOKE_PATTERNS.some((re) => re.test(line))) return true;
  // Generic "X is Y" with no concrete noun is suspect.
  if (/^[A-Z]?(love|life|hope|change|truth)\s+is\s+/i.test(line) && line.split(' ').length < 8) return true;
  // Mode-mismatch checks — cheap pattern probes.
  if (type === 'paradox') {
    // No hinge anywhere — paradox failed its contract.
    if (!/\b(and yet|even as|but|while|though|despite|the more)\b/i.test(line) && !/[—–]/.test(line)) {
      return true;
    }
  }
  if (type === 'aphorism') {
    const words = line.trim().split(/\s+/).filter(Boolean).length;
    if (words > 18) return true;
    if (/\?\s*$/.test(line)) return true;
  }
  if (type === 'aside') {
    if (/!\s*$/.test(line)) return true;
  }
  return false;
}

function sanitize(text) {
  if (!text) return '';
  let out = text.trim();
  out = out.replace(/^[-•*\d.\s]+/, '');
  out = out.replace(/^["“'']+|["”'']+$/g, '');
  // Collapse to first line — no paragraphs.
  out = out.split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  // Hard length cap. If the model breaks the one-line rule, keep just the first sentence.
  if (out.length > MAX_LINE_LEN) {
    const stop = out.search(/[.!?]\s/);
    if (stop > 0 && stop < MAX_LINE_LEN) {
      out = out.slice(0, stop + 1).trim();
    } else {
      out = out.slice(0, MAX_LINE_LEN).trim();
    }
  }
  return out;
}

const client = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 })
  : null;

// Parse multiline break output. Strips list markers, quotes, blank lines.
// Keeps only lines containing at least one ` _ ` blank token.
function parseBreakLines(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map((s) => s.trim())
    .map((s) => s.replace(/^[-•*\d.)\s]+/, ''))
    .map((s) => s.replace(/^["“'']+|["”'']+$/g, ''))
    .filter((s) => s.length > 0)
    .filter((s) => / _ /.test(s) || / _$/.test(s) || /^_ /.test(s))
    .map((s) => s.length > MAX_LINE_LEN ? s.slice(0, MAX_LINE_LEN).trim() : s);
}

// Like complete(), but returns the raw multiline text without sanitize().
async function completeRaw(messages, system) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 400,
        temperature: 1,
        system: system || systemPrompt(),
        messages,
      },
      { signal: controller.signal }
    );
    return (result.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  } finally {
    clearTimeout(timer);
  }
}

async function complete(messages, system) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 1,
        system: system || systemPrompt(),
        messages,
      },
      { signal: controller.signal }
    );
    const text = (result.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return sanitize(text);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    llm: Boolean(client),
    model: client ? MODEL : null,
    authRequired: isAuthRequired(),
    authConfigured: isDbConfigured(),
  });
});

// LLM endpoints require a session whenever auth is required (always in
// production). The dev-only escape hatch CURRENT_AUTH_DISABLED=true skips
// this check; production always enforces.
function maybeRequireAuth(req, res, next) {
  if (!isAuthRequired()) return next();
  return requireAuth(req, res, next);
}

app.post('/api/generate', maybeRequireAuth, rateLimit, async (req, res) => {
  if (!client) return res.status(503).json({ error: 'llm_unavailable' });
  const body = req.body || {};
  const type = String(body.type || '').toLowerCase();
  const seed = typeof body.seed === 'string' ? body.seed : '';
  const ctx = body.context && typeof body.context === 'object' ? body.context : null;
  if (!VALID_TYPES.has(type)) return res.status(400).json({ error: 'invalid_type' });
  if (seed.length > MAX_SEED_LEN) return res.status(400).json({ error: 'seed_too_long' });

  try {
    let line = await complete(
      [{ role: 'user', content: userPrompt(type, seed, ctx) }],
    );
    // Anti-cliché: if the first pass smells generic, regenerate once with a
    // sharper instruction. Single retry — keeps latency bounded.
    if (line && isCliche(line, type)) {
      try {
        line = await complete(
          [{
            role: 'user',
            content:
              userPrompt(type, seed, ctx) +
              '\nThe previous attempt was too generic, motivational, or therapy-flavored. Rewrite from the pressure point: the contradiction, the avoided admission, or the almost-said thing. Specific noun, specific verb. No "remember", "embrace", "journey", "trauma", "boundaries".',
          }],
        );
      } catch {
        // keep the first line if retry fails
      }
    }
    if (!line) return res.status(502).json({ error: 'empty_response' });
    return res.json({ line, type, seeded: seed.trim().length > 0 });
  } catch (err) {
    const status = err?.status || (err?.name === 'AbortError' ? 504 : 500);
    console.warn(`[generate] type=${type} status=${status} err=${err?.name || 'unknown'}`);
    return res.status(status === 504 ? 504 : 502).json({ error: 'generation_failed' });
  }
});

app.post('/api/edit', maybeRequireAuth, rateLimit, async (req, res) => {
  if (!client) return res.status(503).json({ error: 'llm_unavailable' });
  const body = req.body || {};
  const op = String(body.op || '').toLowerCase();
  const line = typeof body.line === 'string' ? body.line : '';
  const type = typeof body.type === 'string' ? body.type.toLowerCase() : '';
  if (!VALID_EDIT_OPS.has(op)) return res.status(400).json({ error: 'invalid_op' });
  if (!line.trim()) return res.status(400).json({ error: 'empty_line' });
  if (line.length > MAX_SEED_LEN) return res.status(400).json({ error: 'line_too_long' });

  try {
    const out = await complete(
      [{ role: 'user', content: editPrompt(op, line, type) }],
    );
    if (!out) return res.status(502).json({ error: 'empty_response' });
    return res.json({ line: out, op });
  } catch (err) {
    const status = err?.status || (err?.name === 'AbortError' ? 504 : 500);
    console.warn(`[edit] op=${op} status=${status} err=${err?.name || 'unknown'}`);
    return res.status(status === 504 ? 504 : 502).json({ error: 'edit_failed' });
  }
});

// ─── /api/generate-breaks ────────────────────────────────────────────────────
//
// Generate a small set of fill-in-the-blank skeletons ("breaks") for a
// Complete board (confession / image / question / memory / contradiction /
// threshold / return). The client falls back to a static bank if this fails.

app.post('/api/generate-breaks', maybeRequireAuth, rateLimit, async (req, res) => {
  if (!client) return res.status(503).json({ error: 'llm_unavailable' });
  const body = req.body || {};
  const board = String(body.board || '').toLowerCase();
  const requestedCount = Number(body.count);
  const count = Number.isFinite(requestedCount)
    ? Math.max(2, Math.min(6, Math.floor(requestedCount)))
    : 4;
  const ctx = body.context && typeof body.context === 'object' ? body.context : null;
  if (!VALID_BOARDS.has(board)) return res.status(400).json({ error: 'invalid_board' });

  try {
    const raw = await completeRaw(
      [{ role: 'user', content: breaksPrompt(board, count, ctx) }],
    );
    const breaks = parseBreakLines(raw).slice(0, count);
    if (breaks.length === 0) return res.status(502).json({ error: 'empty_response' });
    return res.json({ breaks, board });
  } catch (err) {
    const status = err?.status || (err?.name === 'AbortError' ? 504 : 500);
    console.warn(`[generate-breaks] board=${board} status=${status} err=${err?.name || 'unknown'}`);
    return res.status(status === 504 ? 504 : 502).json({ error: 'generation_failed' });
  }
});

// ─── /api/anchor ─────────────────────────────────────────────────────────────
//
// Stillwater grounding. Returns one short anchor line for a speaker who feels
// pulled — either toward compliance ("being pulled under"), toward defiant
// rebellion ("kicking against the current"), or just trying to hold the line.
// Reuses the same client, sanitize(), and cliché filter as /api/generate; the
// only thing that differs is the prompt contract.

const VALID_PULLS = new Set(['under', 'holding', 'against']);
const PULL_DESCRIPTIONS = {
  under:    'being pulled under — absorbing the room, performing fluency, agreeing in advance, losing the thread of who they were before they walked in',
  holding:  'holding the line — trying to stay porous to real things and closed to manufactured ones',
  against:  'kicking against the current — still inside the argument, still feeding what they reject by refusing it loudly',
};

function anchorPrompt(pull, custom) {
  const trimmed = (custom || '').trim().slice(0, MAX_SEED_LEN);
  const hasCustom = trimmed.length > 0;
  const pullClause = `The speaker is ${PULL_DESCRIPTIONS[pull] || PULL_DESCRIPTIONS.holding}.`;
  const customClause = hasCustom
    ? `\nWhat is pulling at them, in their own words — hold this without quoting or paraphrasing: ${trimmed}`
    : '\nNo specifics were given. Stay general but particular: a small concrete detail (room, weather, body, tool, hour) carries the line.';
  return [
    'Write one anchor line.',
    'Contract: a quiet grounding statement for someone who is calibrating between two failure modes — absorbing the room or rebelling against it. Not advice. Not a reassurance. A line that lets the speaker step out of the pull without resolving it for them.',
    'Voice: settled, dry, lightly wry, never preachy. A trusted friend who also sees clearly. Concrete. First or second person both fine; second-person commands forbidden.',
    'Shape: one line, under 18 words, declarative or observational. No exclamations. No rhetorical questions. No motivational cadence. No therapy vocabulary. No "remember", "embrace", "journey", "warrior", "trauma", "boundaries", "showing up", "authenticity".',
    'Test: if it could appear on a self-help poster, rewrite it. If it tells the speaker how to feel, rewrite it. If it sounds like meditation-app copy, rewrite it. The line should feel overheard, not announced.',
    pullClause,
    customClause,
  ].join(' ');
}

app.post('/api/anchor', maybeRequireAuth, rateLimit, async (req, res) => {
  if (!client) return res.status(503).json({ error: 'llm_unavailable' });
  const body = req.body || {};
  const pull = String(body.pull || 'holding').toLowerCase();
  const custom = typeof body.custom === 'string' ? body.custom : '';
  if (!VALID_PULLS.has(pull)) return res.status(400).json({ error: 'invalid_pull' });
  if (custom.length > MAX_SEED_LEN) return res.status(400).json({ error: 'custom_too_long' });

  try {
    let line = await complete(
      [{ role: 'user', content: anchorPrompt(pull, custom) }],
    );
    if (line && isCliche(line)) {
      try {
        line = await complete(
          [{
            role: 'user',
            content:
              anchorPrompt(pull, custom) +
              '\nThe previous attempt was too generic, motivational, or therapy-flavored. Rewrite drier and more specific. One concrete detail. No "remember", "embrace", "journey", "trauma", "boundaries".',
          }],
        );
      } catch {
        // keep the first line if retry fails
      }
    }
    if (!line) return res.status(502).json({ error: 'empty_response' });
    return res.json({ line, pull });
  } catch (err) {
    const status = err?.status || (err?.name === 'AbortError' ? 504 : 500);
    console.warn(`[anchor] pull=${pull} status=${status} err=${err?.name || 'unknown'}`);
    return res.status(status === 504 ? 504 : 502).json({ error: 'generation_failed' });
  }
});

// ─── /api/why-break ──────────────────────────────────────────────────────────
//
// Recommend the strongest break for a fragment, plus a one-sentence reason.
// Cheap, rule-based first pass — falls through to LLM only if the fragment
// is ambiguous and the LLM is available. Keeps latency near-zero on the
// common path so it can be called as the user types.

function ruleBasedBreakReader(text) {
  const t = (text || '').trim();
  if (t.length < 6) return null;
  const lower = t.toLowerCase();

  // Belief vs behavior — strong contradiction signal.
  if (/\b(say|claim|tell|told|promise|swear)\b.*\b(but|and yet|then)\b/i.test(lower) ||
      /\b(want|wanted|love|hate|miss)\b.*\b(but|and yet)\b.*\b(do|don't|did|didn't|keep|kept|never|always)\b/i.test(lower) ||
      /\bi (say|told|promise|swear|claim)\b/i.test(lower) && /\bbut\b|\byet\b/.test(lower)) {
    return {
      type: 'contradiction',
      reason: 'belief and behavior are pulling against each other here.',
    };
  }

  // Paradox: hinge words, two-truth tension.
  if (/\b(and yet|even as|the more.+the less|the closer.+the further|while|though|despite)\b/i.test(lower)) {
    return {
      type: 'paradox',
      reason: 'two truths are alive in the line — let them stay tense.',
    };
  }
  // "the more X the less Y" / mirror structures.
  if (/\bthe (more|closer|harder|longer)\b/i.test(lower) && /\b(less|further|shorter|softer|smaller)\b/i.test(lower)) {
    return {
      type: 'paradox',
      reason: 'a hinge has formed — paradox will hold the tension.',
    };
  }

  // Aphorism: short, declarative, image or concrete noun.
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 4 && wordCount <= 14 && !/[?]/.test(lower)) {
    return {
      type: 'aphorism',
      reason: 'short and declarative — sharpen this into one portable line.',
    };
  }

  return null;
}

app.post('/api/why-break', maybeRequireAuth, rateLimit, async (req, res) => {
  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) return res.status(400).json({ error: 'empty_text' });
  if (text.length > MAX_SEED_LEN) return res.status(400).json({ error: 'text_too_long' });

  const rule = ruleBasedBreakReader(text);
  if (rule) return res.json({ ...rule, source: 'rule' });

  // Fall back to a default; do not call the LLM for this — keep it fast.
  return res.json({
    type: 'aphorism',
    reason: 'still finding its shape — try sharpening what is here.',
    source: 'default',
  });
});

const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir, { maxAge: '1h', index: false }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Current server listening on :${PORT} (llm=${Boolean(client)}, model=${MODEL}, authRequired=${isAuthRequired()}, authConfigured=${isDbConfigured()})`);
  if (isDbConfigured()) {
    initDb().then((ok) => {
      console.log(`[auth] db init ${ok ? 'ok' : 'failed'}`);
    });
  } else if (isAuthRequired()) {
    console.error('[auth] DATABASE_URL is NOT set but auth is required (production or CURRENT_AUTH_DISABLED!=true). Login and LLM endpoints will return 503 until DATABASE_URL is provided.');
  } else {
    console.warn('[auth] CURRENT_AUTH_DISABLED=true (dev only) — login gate skipped, LLM endpoints open.');
  }
});
