import { Platform } from 'react-native';

export const Colors = {
  deepNavy: '#0A1628',
  navy: '#162235',
  card: '#1C2E42',
  cardAlt: '#213349',
  border: '#2A4060',
  borderLight: '#3A5070',
  sand: '#C4A882',
  sandLight: '#D4B896',
  saltWhite: '#F0EDE8',
  amber: '#C48B2F',
  amberLight: '#D4A040',
  muted: '#6B7F8F',
  mutedLight: '#8A9BAC',
  error: '#C4614A',
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
  'rising swell',
  'offshore winds',
  'storm front',
  'low tide',
  'heavy current',
  'golden hour calm',
  'building chop',
  'dead calm',
];

export const TIDE_COLORS: Record<string, string> = {
  'glass water': '#4A7FA5',
  'rising swell': '#2E6B8A',
  'offshore winds': '#6A9BB5',
  'storm front': '#2A3D50',
  'low tide': '#8A7A5A',
  'heavy current': '#2A5A6A',
  'golden hour calm': '#C48B2F',
  'building chop': '#4A6070',
  'dead calm': '#1A2D3A',
};

export const VERSO_TEMPLATES = [
  'The ocean is a _ for the _ mind.',
  'Coffee is _ disguised as _.',
  'Freedom feels like _ when _.',
  'Silence is the language of _.',
  '_ is the price of _.',
  'To _ is to forget that _.',
];

// Fill-in-the-blank template families used by Verso · Complete · Generate.
// Each family is a small bank of skeletons; Generate picks one and seeds blanks
// from any present fragment/tags so the user always finishes the line.
export type CompleteFamily =
  | 'confession'
  | 'image'
  | 'question'
  | 'memory'
  | 'contradiction'
  | 'threshold'
  | 'return';

export const COMPLETE_FAMILIES: Array<{ id: CompleteFamily; label: string; hint: string }> = [
  { id: 'confession',    label: 'confession',    hint: 'admit something quietly' },
  { id: 'image',         label: 'image',         hint: 'a picture in a single line' },
  { id: 'question',      label: 'question',      hint: 'a question you can’t answer' },
  { id: 'memory',        label: 'memory',        hint: 'a small remembered thing' },
  { id: 'contradiction', label: 'contradiction', hint: 'two truths against each other' },
  { id: 'threshold',     label: 'threshold',     hint: 'just before something changes' },
  { id: 'return',        label: 'return',        hint: 'coming back to the same place' },
];

export const COMPLETE_TEMPLATES: Record<CompleteFamily, string[]> = {
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

// Verso shaping modes. Paradox is now folded in here as one of the modes.
export const VERSO_MODES = [
  { id: 'complete', label: 'complete', hint: 'fill the blanks' },
  { id: 'paradox',  label: 'paradox',  hint: 'a truth that undoes itself' },
  { id: 'distill',  label: 'distill',  hint: 'shorter, truer' },
  { id: 'aphorism', label: 'aphorism', hint: 'a single line, sharpened' },
  { id: 'invert',   label: 'invert',   hint: 'flip it on its head' },
] as const;
export type VersoMode = typeof VERSO_MODES[number]['id'];
