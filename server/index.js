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
    'You write a single short line for a creative writing app called Swell.',
    'Voice: terse, image-led, contemporary. Strong verbs and concrete nouns.',
    'Forbidden: motivational-poster tone, self-help clichés, "remember", "embrace", "journey", "warrior", "blessed", emojis, hashtags, quotation marks, attributions, explanations, preambles.',
    'Output exactly one line under 22 words. No leading dash, number, or label. No trailing period required.',
  ].join(' ');
}

function userPrompt(type, seed) {
  const trimmed = (seed || '').trim().slice(0, MAX_SEED_LEN);
  const seedClause = trimmed
    ? `\nThe line should hold this fragment in mind, without quoting or naming it: ${trimmed}`
    : '';
  switch (type) {
    case 'aphorism':
      return [
        'Write one aphorism: a compressed observation that lands like a small bell.',
        'It states something true and slightly unfamiliar. Image or specific detail beats abstraction.',
        'Avoid wisdom-cookie phrasing. No "is the new", no "we all", no second-person commands.',
        seedClause,
      ].join(' ');
    case 'paradox':
      return [
        'Write one paradox: a single line that holds two facts which seem to undo each other but are both true.',
        'Use a quiet "but/and yet/the more... the less" hinge or a turn mid-line.',
        'Image-grounded if possible. No riddle phrasing, no "I am both X and Y" formula.',
        seedClause,
      ].join(' ');
    case 'contradiction':
      return [
        'Write one contradiction: a single line where the second half cuts against the first.',
        'It should feel honest, not clever. Concrete subject, then a turn that exposes the lie inside the want.',
        'No "but they say" framing, no "everyone wants X but nobody Y" pattern.',
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
    return res.json({ line, type });
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
