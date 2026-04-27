import { Platform } from 'react-native';

// Palette: muted turquoise / teal / ocean.
// Semantic names are preserved (amber, sand, navy) so the rest of the app
// continues to compile, but their hex values have been shifted into a
// low-saturation ocean family — sea-glass, deep teal, dusk ocean, mist —
// for a quieter, more mesmerizing surface than the previous blue-and-gold.
// Hues are deliberately pulled toward 185–200° (cool teal/aqua) and away from
// 150–170° (which can read as olive/khaki/yellow against a dark surface).
// Saturation is kept low; lightness does the lifting.
export const Colors = {
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
// warm/yellow cast anywhere on the atlas.
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

// Verso · Complete is organised as: pick a *board* (a high-level posture —
// confession, image, etc.), then choose or generate a *break* underneath it.
// A break is a fill-in-the-blank skeleton with one or more `_` blanks the user
// finishes. Static break banks below are used as fallbacks when the LLM is
// unreachable; the primary path is generation. The legacy names
// `CompleteFamily` / `COMPLETE_TEMPLATES` are kept as type aliases so existing
// imports keep compiling.
export type CompleteBoard =
  | 'confession'
  | 'image'
  | 'question'
  | 'memory'
  | 'contradiction'
  | 'threshold'
  | 'return';

// Legacy alias — internal type name preserved to avoid an invasive rename.
export type CompleteFamily = CompleteBoard;

export const COMPLETE_BOARDS: Array<{ id: CompleteBoard; label: string; hint: string }> = [
  { id: 'confession',    label: 'confession',    hint: 'admit something quietly' },
  { id: 'image',         label: 'image',         hint: 'a picture in a single line' },
  { id: 'question',      label: 'question',      hint: 'a question you can’t answer' },
  { id: 'memory',        label: 'memory',        hint: 'a small remembered thing' },
  { id: 'contradiction', label: 'contradiction', hint: 'two truths against each other' },
  { id: 'threshold',     label: 'threshold',     hint: 'just before something changes' },
  { id: 'return',        label: 'return',        hint: 'coming back to the same place' },
];

// Legacy alias for the same array — kept for any caller still importing it.
export const COMPLETE_FAMILIES = COMPLETE_BOARDS;

// Static fallback breaks per board. Used only when /api/generate-breaks is
// unavailable; the primary creative engine is the LLM.
export const COMPLETE_BREAK_FALLBACKS: Record<CompleteBoard, string[]> = {
  confession: [
    'I never told anyone that _ was really about _.',
    'The truth is, I _ when no one is _.',
    'I have spent _ pretending not to want _.',
    'What I keep from _ is the part where _.',
  ],
  image: [
    'A _ on the windowsill, and outside, _.',
    'Light through _ makes the room feel like _.',
    'The _ moves the way _ used to.',
    'A small _ in the shape of _.',
  ],
  question: [
    'What if _ is just _ in slower light?',
    'How much of _ was always _?',
    'Why does _ still taste like _?',
    'When did _ become the thing I _?',
  ],
  memory: [
    'I remember _ better than _.',
    'The summer of _ smelled like _.',
    'You said _ and I heard _.',
    'There was a _, and then there wasn’t.',
  ],
  contradiction: [
    '_ is just _ dressed up.',
    'To want _ is to refuse _.',
    'The closer I get to _, the more I miss _.',
    '_ feels like freedom until it feels like _.',
  ],
  threshold: [
    'The hour before _ is _.',
    'Just before _, the world goes _.',
    'On the edge of _, everything _.',
    'The room held its breath, then _.',
  ],
  return: [
    'I keep coming back to _, the way water keeps _.',
    'Every road leads back to _ eventually.',
    'I forget _, and then _ reminds me.',
    'Some part of me is still _ in _.',
  ],
};

// Legacy export name preserved for any external caller; identical contents.
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

// Verso shaping modes. Paradox / aphorism / contradiction are first-class
// breaks here and are wired to LLM generation (see src/llm.ts). The local
// fallback banks below are used when the LLM is unreachable.
export const VERSO_MODES = [
  { id: 'complete',      label: 'complete',      hint: 'fill the blanks',
    subtitle: 'finish the line' },
  { id: 'paradox',       label: 'paradox',       hint: 'a truth that undoes itself',
    subtitle: 'two truths pulling against each other' },
  { id: 'aphorism',      label: 'aphorism',      hint: 'a single line, sharpened',
    subtitle: 'a truth that wants to become portable' },
  { id: 'contradiction', label: 'contradiction', hint: 'two truths against each other',
    subtitle: 'the split between belief and behavior' },
  { id: 'distill',       label: 'distill',       hint: 'shorter, truer',
    subtitle: 'cut until only the truth is left' },
  { id: 'invert',        label: 'invert',        hint: 'flip it on its head',
    subtitle: 'turn the line inside out' },
] as const;
export type VersoMode = typeof VERSO_MODES[number]['id'];

// Local fallbacks used only when /api/generate is unreachable. Kept terse and
// rotated by Math.random; the LLM is the primary creative engine.
export const LOCAL_FALLBACK_LINES: Record<'aphorism' | 'paradox' | 'contradiction', string[]> = {
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
};
