// Minimal Node/Express API for Swell.
// - Serves the Expo static web export from /dist with SPA fallback.
// - Exposes POST /api/generate which calls Anthropic for aphorism / paradox /
//   contradiction generation. The Anthropic API key is server-only and is
//   never exposed to the client.
//
// Required env (server-only):
//   ANTHROPIC_API_KEY   Anthropic key. Required for /api/generate.
// Optional:
//   LLM_MODEL           Claude model id. Defaults to a fast Claude model.
//   LLM_RATE_LIMIT_PER_MIN  Per-IP requests/minute on /api/generate. Default 20.
//   PORT                Port to listen on. Default 3000.

const path = require('path');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001';
const RATE_LIMIT_PER_MIN = Number(process.env.LLM_RATE_LIMIT_PER_MIN) || 20;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const MAX_SEED_LEN = 280;
const MAX_OUTPUT_TOKENS = 120;
const REQUEST_TIMEOUT_MS = 8000;

const VALID_TYPES = new Set(['aphorism', 'paradox', 'contradiction']);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));

// Tiny in-memory rate limiter, keyed by client IP. Sliding window of 60s.
// This is best-effort — multi-instance Railway deploys won't share state, but
// it's enough to slow obvious abuse from a single IP.
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
    // Cheap GC to keep memory bounded.
    for (const [k, v] of buckets) {
      if (v.length === 0 || v[v.length - 1] < windowStart) buckets.delete(k);
    }
  }
  next();
}

function systemPrompt() {
  return [
    'You write a single short line for a creative writing instrument called Swell.',
    'Voice: terse, image-led, contemporary, exact. Strong verbs, concrete nouns, specific particulars over abstractions.',
    'Pursue ingenuity: prefer the angle a careful writer would choose on the third try, not the first. Surprise without straining.',
    'Forbidden: motivational-poster tone, self-help clichés, TED-talk cadence, "remember", "embrace", "journey", "warrior", "blessed", "we all", "is the new", second-person commands, rhetorical questions, emojis, hashtags, quotation marks, attributions, explanations, preambles, trailing moralizing.',
    'Output exactly one line, under 22 words. No leading dash, number, or label. No trailing period required.',
  ].join(' ');
}

function userPrompt(type, seed) {
  const trimmed = (seed || '').trim().slice(0, MAX_SEED_LEN);
  const hasSeed = trimmed.length > 0;
  const seedClause = hasSeed
    ? `\nHold this fragment in mind without quoting, naming, or paraphrasing it directly — let it sit underneath the line: ${trimmed}`
    : '\nNo seed was provided. Invent a small, specific scene or object as the anchor — kitchen, weather, transit, body, tool. Do not address or assume anything about the reader.';

  switch (type) {
    case 'aphorism':
      return [
        'Write one aphorism.',
        'Contract: a compressed, portable truth. Carved, final, stand-alone. Reads as if it has always existed.',
        'Shape: declarative. State the world, do not advise it. One concrete image or specific detail does the work; abstraction alone fails.',
        'Test: if the line could appear on a coffee mug, rewrite it. If it sounds like a quote-card, rewrite it. If a stranger could not repeat it from memory after one read, sharpen it.',
        'Forbidden here: "is the new ___", "the only ___ is ___", "true ___ is ___", lecturing, hedging, soft sentiment.',
        seedClause,
      ].join(' ');
    case 'paradox':
      return [
        'Write one paradox.',
        'Contract: two things that are both true and pull against each other. Tension stays alive at the end of the line — no neat resolution, no answer, no wink.',
        'Shape: a single sentence with a hinge ("and yet", "but", "the more... the less", "even as", "while"), or a clean turn mid-line. Concrete on both sides of the hinge.',
        'Test: if either half can be deleted without loss, it is not yet a paradox. If the line resolves the contradiction, remove the resolution.',
        'Forbidden here: riddle phrasing, "I am both X and Y", "everyone X but no one Y", clever oxymorons that collapse on inspection.',
        seedClause,
      ].join(' ');
    case 'contradiction':
      return [
        'Write one contradiction.',
        'Contract: a mismatch between what someone believes / says / wants and what they actually do. Expose self-betrayal, avoidance, or a hidden incentive — with bite, never cruelty.',
        'Shape: concrete subject and a small, observable behavior. The line should sting because it is recognisable, not because it accuses. Specificity over generality. The behavior is the punchline; do not explain it.',
        'Test: if the line preaches, cut it. If the line could apply to "everyone", make the subject more specific. The reader should feel caught, not lectured.',
        'Forbidden here: "but they say", "everyone wants X but nobody Y", finger-wagging, irony quotes, therapy vocabulary ("trauma", "boundaries", "authenticity").',
        seedClause,
      ].join(' ');
    default:
      return 'Write one short line.' + seedClause;
  }
}

function sanitize(text) {
  if (!text) return '';
  // Strip surrounding quotes/whitespace, collapse newlines, remove leading
  // bullets/numbering an enthusiastic model sometimes adds.
  let out = text.trim();
  out = out.replace(/^[-•*\d.\s]+/, '');
  out = out.replace(/^["“'']+|["”'']+$/g, '');
  out = out.split('\n').map((s) => s.trim()).filter(Boolean)[0] || '';
  // Hard length cap as a safety net.
  if (out.length > 240) out = out.slice(0, 240).trim();
  return out;
}

const client = ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 })
  : null;

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, llm: Boolean(client), model: client ? MODEL : null });
});

app.post('/api/generate', rateLimit, async (req, res) => {
  if (!client) {
    return res.status(503).json({ error: 'llm_unavailable' });
  }
  const body = req.body || {};
  const type = String(body.type || '').toLowerCase();
  const seed = typeof body.seed === 'string' ? body.seed : '';
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ error: 'invalid_type' });
  }
  if (seed.length > MAX_SEED_LEN) {
    return res.status(400).json({ error: 'seed_too_long' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 1,
        system: systemPrompt(),
        messages: [{ role: 'user', content: userPrompt(type, seed) }],
      },
      { signal: controller.signal }
    );
    const text = (result.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const line = sanitize(text);
    if (!line) {
      return res.status(502).json({ error: 'empty_response' });
    }
    return res.json({ line, type, seeded: seed.trim().length > 0 });
  } catch (err) {
    const status = err?.status || (err?.name === 'AbortError' ? 504 : 500);
    // Deliberately do not log seed text or full prompt — only the type and
    // a coarse error label. Avoids leaking user input into Railway logs.
    console.warn(`[generate] type=${type} status=${status} err=${err?.name || 'unknown'}`);
    return res.status(status === 504 ? 504 : 502).json({ error: 'generation_failed' });
  } finally {
    clearTimeout(timer);
  }
});

const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir, { maxAge: '1h', index: false }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Swell server listening on :${PORT} (llm=${Boolean(client)}, model=${MODEL})`);
});
