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
