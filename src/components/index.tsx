import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  TextInputProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';

// ─── Card ────────────────────────────────────────────────────────────────────

type CardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
};

export function Card({ children, style, onPress }: CardProps) {
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.card, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

// ─── Header ──────────────────────────────────────────────────────────────────

type HeaderProps = {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
};

export function Header({ title, onBack, rightAction }: HeaderProps) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.headerBack} activeOpacity={0.7}>
          <Text style={styles.headerBackText}>←</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerBack} />
      )}
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerRight}>{rightAction}</View>
    </View>
  );
}

// ─── SwellInput ───────────────────────────────────────────────────────────────

type SwellInputProps = TextInputProps & {
  style?: TextStyle;
  containerStyle?: ViewStyle;
};

export function SwellInput({ style, containerStyle, ...props }: SwellInputProps) {
  return (
    <View style={[styles.inputContainer, containerStyle]}>
      <RNTextInput
        placeholderTextColor={Colors.muted}
        style={[styles.input, style]}
        selectionColor={Colors.amber}
        {...props}
      />
    </View>
  );
}

// ─── CollectionItem ───────────────────────────────────────────────────────────

type CollectionItemProps = {
  children: React.ReactNode;
  meta?: string;
  badge?: string;
  onDelete?: () => void;
  style?: ViewStyle;
};

export function CollectionItem({ children, meta, badge, onDelete, style }: CollectionItemProps) {
  return (
    <View style={[styles.collectionItem, style]}>
      <View style={styles.collectionItemContent}>
        {badge && <Text style={styles.badge}>{badge}</Text>}
        {children}
        {meta && <Text style={styles.metaText}>{meta}</Text>}
      </View>
      {onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteButton} activeOpacity={0.7}>
          <Text style={styles.deleteText}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

type EmptyStateProps = {
  title: string;
  subtitle?: string;
};

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 800,
      delay: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.emptyState, { opacity }]}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </Animated.View>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

type PillProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

export function Pill({ label, active, onPress }: PillProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.pill, active && styles.pillActive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function Divider() {
  return <View style={styles.divider} />;
}

// ─── TidalReading ────────────────────────────────────────────────────────────
//
// Small mobile-first oceanographic display for Drift/home. Deterministic,
// local: it reads the current hour and (optionally) a recent tide tag and
// renders a tide gauge + waterline + a poetic sentence. No analytics, no
// charting libraries.

type TidalReadingProps = {
  recentTide?: string | null;
  testID?: string;
};

const READING_PHRASES: Record<string, string[]> = {
  rising:  ['the water is rising', 'a slow lift in the line', 'the tide gathers'],
  falling: ['the water is pulling back', 'the line goes long', 'a small retreat'],
  high:    ['the bay is full', 'glass at the brim', 'high water holds'],
  low:     ['the floor shows', 'low water, soft sand', 'the bones of the bay are visible'],
  slack:   ['the water is paused', 'between two breaths', 'still, before it turns'],
};

function computeReading(now: Date, recentTide?: string | null) {
  // 12.42-hour deterministic synthetic tide (one full cycle ~ semidiurnal).
  // We don't model real tides — we model a *reading*. The user's local hour
  // gives a stable position-in-cycle that changes slowly through the day.
  const hours = now.getHours() + now.getMinutes() / 60;
  const phase = (hours % 12.42) / 12.42; // 0..1
  const level = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5; // 0..1

  let label: keyof typeof READING_PHRASES;
  if (level > 0.78) label = 'high';
  else if (level < 0.22) label = 'low';
  else {
    // Rising in first half of phase, falling in second half.
    if (phase < 0.25 || phase >= 0.75) label = 'rising';
    else if (phase >= 0.25 && phase < 0.5) label = 'high';
    else label = 'falling';
  }

  // If user recently tagged with "dead calm" or "glass water", lean into slack.
  if (recentTide && /dead calm|glass water|golden hour/.test(recentTide)) {
    label = 'slack';
  }

  const bank = READING_PHRASES[label];
  // Stable phrase per hour, not random per render.
  const phrase = bank[now.getHours() % bank.length];
  return { level, label, phrase };
}

export function TidalReading({ recentTide, testID }: TidalReadingProps) {
  const reading = computeReading(new Date(), recentTide ?? null);
  const fillPct = Math.round(reading.level * 100);

  return (
    <View style={tidalStyles.container} testID={testID ?? 'tidal-reading'}>
      <View style={tidalStyles.header}>
        <Text style={tidalStyles.label}>tidal reading</Text>
        <Text style={tidalStyles.state}>{reading.label}</Text>
      </View>

      <View style={tidalStyles.gaugeWrap}>
        <View style={tidalStyles.gauge}>
          <View
            style={[
              tidalStyles.water,
              { height: `${fillPct}%` },
            ]}
          />
          <View style={[tidalStyles.waterline, { bottom: `${fillPct}%` }]} />
        </View>
        <View style={tidalStyles.ticks}>
          {['high', 'mid', 'low'].map((t) => (
            <Text key={t} style={tidalStyles.tickText}>{t}</Text>
          ))}
        </View>
      </View>

      <Text style={tidalStyles.phrase}>{reading.phrase}</Text>
    </View>
  );
}

const tidalStyles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: Colors.border,
    borderBottomColor: Colors.border,
    backgroundColor: '#0E1B2D',
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.sm,
  },
  label: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  state: {
    color: Colors.amber,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
  },
  gaugeWrap: {
    flexDirection: 'row',
    height: 80,
    alignItems: 'stretch',
    marginBottom: Spacing.sm,
  },
  gauge: {
    flex: 1,
    backgroundColor: '#0A1628',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  water: {
    backgroundColor: '#2E6B8A55',
    width: '100%',
  },
  waterline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.amber + 'BB',
  },
  ticks: {
    width: 44,
    marginLeft: Spacing.sm,
    justifyContent: 'space-between',
  },
  tickText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
  },
  phrase: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    textAlign: 'center',
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBack: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerBackText: {
    color: Colors.sand,
    fontSize: FontSizes.xl,
    fontFamily: Fonts.sans,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: Colors.saltWhite,
    fontSize: FontSizes.md,
    fontFamily: Fonts.sans,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  inputContainer: {
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  input: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    minHeight: 40,
  },
  collectionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  collectionItemContent: {
    flex: 1,
  },
  badge: {
    color: Colors.muted,
    fontSize: FontSizes.xs,
    fontFamily: Fonts.sans,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  metaText: {
    color: Colors.muted,
    fontSize: FontSizes.xs,
    fontFamily: Fonts.sans,
    marginTop: Spacing.xs,
  },
  deleteButton: {
    paddingLeft: Spacing.md,
    paddingTop: 2,
  },
  deleteText: {
    color: Colors.muted,
    fontSize: FontSizes.xl,
    fontFamily: Fonts.sans,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xl,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 20,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  pillActive: {
    backgroundColor: Colors.amber,
    borderColor: Colors.amber,
  },
  pillText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  pillTextActive: {
    color: Colors.deepNavy,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
});
