import { Platform } from 'react-native';

// ─── Palettes ────────────────────────────────────────────────────────────────
//
// Two palettes share one schema. Every screen reads from `Colors`, which is a
// live pointer that swaps when the theme changes (see `setColorScheme`). The
// app remounts on toggle so frozen `StyleSheet.create` outputs rebuild from
// the new palette.
//
// Semantic role names (deepNavy, navy, card, sand, amber, etc.) are preserved
// from the original ocean palette so existing styles compile unchanged. Their
// hexes shift between schemes; the role each one plays does not.
//
// Dark — abyssal teal, kelp shadow, sea glass. The room at night.
// Light — Waikiki shallows: luminous tropical turquoise on top, reef visible
//         beneath. Cool aqua surfaces, kelp/coral tones for chrome.

type Palette = {
  deepNavy: string;
  navy: string;
  card: string;
  cardAlt: string;
  border: string;
  borderLight: string;
  sand: string;
  sandLight: string;
  saltWhite: string;
  amber: string;
  amberLight: string;
  muted: string;
  mutedLight: string;
  error: string;
};

export const darkPalette: Palette = {
  deepNavy: '#071A1F',     // abyssal teal — app background
  navy: '#0E2429',         // dusk ocean — nav surfaces
  card: '#143036',         // submerged stone — primary surface
  cardAlt: '#1A3A41',      // tide pool — secondary surface
  border: '#22454D',       // kelp shadow
  borderLight: '#345A62',  // mist border
  sand: '#6FA6AC',         // cool sea glass — primary text accent
  sandLight: '#9CC4C8',    // cool foam mist — softer secondary
  saltWhite: '#E6EEF0',    // salt mist — primary readable text
  amber: '#4F8F95',        // dusk teal — primary accent (no warm cast)
  amberLight: '#6FB0B5',   // lifted cool aqua
  muted: '#5E7E83',        // drift grey-teal
  mutedLight: '#86A2A6',   // overcast
  error: '#A35E50',        // rust coral, desaturated
};

// Waikiki shallows — looking down through clear tropical water onto reef.
// Background is the bright turquoise of two-foot water at noon. Borders and
// muted text are kelp/coral tones, the shapes you see when you squint past
// the surface. Accent is a saturated reef teal — the deep channel between
// reef heads. Body text is near-black so the page reads like ink on water.
export const lightPalette: Palette = {
  deepNavy: '#A6E5DE',     // shallow Waikiki turquoise — app background
  navy: '#7FD4CB',         // a step deeper — nav surfaces, headers
  card: '#C1ECE6',         // foam-lifted shallow — primary surface
  cardAlt: '#D5F2EE',      // bleached lagoon — secondary surface
  border: '#5FB8AE',       // reef edge visible through water
  borderLight: '#88CFC6',  // softer reef shadow
  sand: '#1F4F4A',         // wet kelp — primary text accent
  sandLight: '#2E6963',    // dimmer kelp
  saltWhite: '#0B2422',    // ink on water — primary readable text
  amber: '#0E5A55',        // deep reef channel — primary accent
  amberLight: '#1A7A72',   // lifted channel teal
  muted: '#4F7B76',        // overcast lagoon
  mutedLight: '#739E99',   // distant reef haze
  error: '#A8463A',        // coral red, desaturated to fit the lagoon
};

// ─── Live Colors object ──────────────────────────────────────────────────────
//
// We expose a mutable `Colors` object whose properties match a Palette. On
// theme change, `setColorScheme` overwrites every key on this object so any
// future read sees the new value. Existing `StyleSheet.create` outputs are
// frozen, but the App-level remount-on-toggle (App.tsx, key={scheme}) rebuilds
// every stylesheet from the live values.

export type ColorScheme = 'light' | 'dark';

export const Colors: Palette = { ...darkPalette };

let activeScheme: ColorScheme = 'dark';

export function getColorScheme(): ColorScheme {
  return activeScheme;
}

export function setColorScheme(scheme: ColorScheme): void {
  const next = scheme === 'light' ? lightPalette : darkPalette;
  (Object.keys(next) as Array<keyof Palette>).forEach((k) => {
    Colors[k] = next[k];
  });
  activeScheme = scheme;
}

export const Fonts = {
  serif: 'CormorantGaramond_500Medium',
  serifRegular: 'CormorantGaramond_400Regular',
  serifItalic: 'CormorantGaramond_400Regular_Italic',
  serifBold: 'CormorantGaramond_700Bold',
  serifSemiBold: 'CormorantGaramond_600SemiBold',
  sans: Platform.select({ ios: 'System', android: 'Roboto', default: 'System' }),
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 6,
  md: 12,
  lg: 18,
  xl: 24,
};

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 20,
  xl: 26,
  xxl: 36,
  xxxl: 52,
};

export const TIDE_STATES = [
  'glass water',
  'returning swell',
  'offshore winds',
  'storm front',
  'low tide',
  'heavy current',
  'slack water',
  'building chop',
  'dead calm',
];

// Tide colors stay inside the muted ocean family — variations of teal,
// sea-glass, kelp, and mist. All values sit in the cool ocean range; no
// warm/yellow cast anywhere on the atlas. These are visible on both palettes
// because they are mid-tone teals — they read as deeper water on light mode
// and lifted highlights on dark mode.
export const TIDE_COLORS: Record<string, string> = {
  'glass water': '#5C9AA0',         // pale cool sea glass
  'returning swell': '#3A7880',     // deeper cool turquoise
  'rising swell': '#3A7880',        // legacy alias — same hue
  'offshore winds': '#6FA6AC',      // foam mist teal
  'storm front': '#1F3A3F',         // storm-dimmed deep
  'low tide': '#6A8E91',            // bleached cool kelp
  'heavy current': '#2C5A5C',       // submerged channel
  'slack water': '#6E9A9C',         // dusk teal — the pause between tides
  'golden hour calm': '#6E9A9C',    // legacy alias — same hue
  'building chop': '#456E70',       // grey-teal chop
  'dead calm': '#163034',           // abyss
};

export const VERSO_TEMPLATES = [
  'The ocean is a _ for the _ mind.',
  'Coffee is _ disguised as _.',
  'Freedom feels like _ when _.',
  'Silence is the language of _.',
  '_ is the price of _.',
  'To _ is to forget that _.',
];

// Verso shaping no longer offers a "complete" / fill-in-the-blank board. The
// CompleteBoard type and its fallback bank are kept here as legacy exports so
// any import elsewhere still compiles, but no Verso surface uses them.
export type CompleteBoard =
  | 'confession'
  | 'image'
  | 'question'
  | 'memory'
  | 'contradiction'
  | 'threshold'
  | 'return';

export type CompleteFamily = CompleteBoard;

export const COMPLETE_BOARDS: Array<{ id: CompleteBoard; label: string; hint: string }> = [];
export const COMPLETE_FAMILIES = COMPLETE_BOARDS;

export const COMPLETE_BREAK_FALLBACKS: Record<CompleteBoard, string[]> = {
  confession: [],
  image: [],
  question: [],
  memory: [],
  contradiction: [],
  threshold: [],
  return: [],
};

export const COMPLETE_TEMPLATES = COMPLETE_BREAK_FALLBACKS;

export const PARADOX_TOPICS = [
  'freedom',
  'time',
  'ambition',
  'silence',
  'love',
  'discipline',
  'memory',
  'belonging',
];

export const DRIFT_TAGS = ['thought', 'verse', 'paradox', 'idea', 'line'] as const;
export type DriftTag = typeof DRIFT_TAGS[number];

// Light context hints attached to a line — Terrain is no longer a system,
// just a one-word interior-weather tag.
export const TERRAIN_HINTS = [
  'still',
  'restless',
  'open',
  'narrow',
  'tender',
  'sharp',
  'porous',
  'hardened',
];

// Verso shaping modes — four first-class breaks, all wired to the LLM
// (see src/llm.ts). The local fallback banks below are used when the LLM
// is unreachable.
export const VERSO_MODES = [
  { id: 'paradox',       label: 'paradox',       hint: 'a truth that undoes itself',
    subtitle: 'hold two incompatible truths' },
  { id: 'aphorism',      label: 'aphorism',      hint: 'a single line, sharpened',
    subtitle: 'compress into a hard little truth' },
  { id: 'contradiction', label: 'contradiction', hint: 'split desire, exposed',
    subtitle: 'the gap between belief and behavior' },
  { id: 'aside',         label: 'aside',         hint: 'turn it sideways',
    subtitle: 'a slanted, idiosyncratic observation with dry wit' },
] as const;
export type VersoMode = typeof VERSO_MODES[number]['id'];

// Local fallbacks used only when /api/generate is unreachable. Kept terse and
// rotated by Math.random; the LLM is the primary creative engine.
export const LOCAL_FALLBACK_LINES: Record<VersoMode, string[]> = {
  aphorism: [
    'A clean room is a small argument with the future.',
    'You learn the city by the routes you keep refusing.',
    'Patience is a slower kind of appetite.',
    'Every habit is a love letter, signed and unread.',
    'Sleep is the only weather we make ourselves.',
  ],
  paradox: [
    'The closer the deadline, the longer each minute.',
    'I trust people most in the rooms I never enter.',
    'The more I rehearse the line, the less I mean it.',
    'A door open all winter stops being a door.',
    'You only notice the silence after the fan stops.',
  ],
  contradiction: [
    'I want a quieter life and louder evidence of it.',
    'I keep my freedoms in a drawer I never open.',
    'I love the city for the version of me it refuses.',
    'I save the good wine for the people who never come over.',
    'I miss the noise I spent a year escaping.',
  ],
  aside: [
    'I wanted solitude with better customer service.',
    'I miss the old me, though we were barely on speaking terms.',
    'My discipline arrives on foot, two blocks behind the appetite.',
    'I have a great relationship with mornings, mostly through correspondence.',
    'Honesty looks better on me in the dark.',
  ],
};
