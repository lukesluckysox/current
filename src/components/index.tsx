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

// ─── WaveForecast ────────────────────────────────────────────────────────────
//
// Surfline-style "inner forecast" card for Drift. Reads the actual app signal
// (saved lines, fragment text, active tags) via the forecast engine and
// renders the result with a "reading" and a recommended writing action.

import type { Forecast } from '../forecast';

type WaveForecastProps = {
  /** Pre-computed forecast from the engine. */
  forecast: Forecast;
  savedToday?: number;
  /** Tap on the recommended-action button. */
  onAction?: () => void;
  /** Tap on the resurface affordance, if a candidate exists. */
  onResurface?: () => void;
  testID?: string;
};

export function WaveForecast({ forecast: f, savedToday, onAction, onResurface, testID }: WaveForecastProps) {
  const heightLow = f.swellHeight.toFixed(1);
  const heightHigh = f.swellHeightHigh.toFixed(1);

  return (
    <View style={waveStyles.container} testID={testID ?? 'wave-forecast'}>
      <View style={waveStyles.header}>
        <Text style={waveStyles.label}>inner forecast</Text>
        <Text style={waveStyles.state}>{f.conditions}</Text>
      </View>

      <View style={waveStyles.readoutRow}>
        <View style={waveStyles.heightBlock}>
          <Text style={waveStyles.heightValue} accessibilityLabel={`line swell ${heightLow} to ${heightHigh} feet`}>
            {heightLow}<Text style={waveStyles.heightDash}>–</Text>{heightHigh}
          </Text>
          <Text style={waveStyles.heightUnit}>ft · {f.texture}</Text>
        </View>
        <View style={waveStyles.miniChartWrap}>
          <View style={waveStyles.miniChart} testID="forecast-bars">
            {f.series.map((v, i) => {
              const isNow = i === f.series.length - 1;
              return (
                <View key={i} style={waveStyles.miniBarSlot}>
                  <View
                    style={[
                      waveStyles.miniBar,
                      { height: `${Math.round(v * 100)}%` },
                      isNow && waveStyles.miniBarNow,
                    ]}
                  />
                </View>
              );
            })}
          </View>
          <View style={waveStyles.miniAxis}>
            <Text style={waveStyles.miniAxisText}>−24h</Text>
            <Text style={[waveStyles.miniAxisText, waveStyles.miniAxisNow]}>now</Text>
          </View>
        </View>
      </View>

      <View style={waveStyles.chipRow}>
        <ForecastChip label={`${f.period}s`} sub="period" />
        <ForecastChip label={f.direction} sub="direction" />
        <ForecastChip label={f.tidePhase} sub="tide" />
        <ForecastChip label={f.source} sub="source" />
      </View>

      <View style={waveStyles.confidenceRow}>
        <Text style={waveStyles.confidenceLabel}>writing conditions</Text>
        <View style={waveStyles.confidenceTrack}>
          <View style={[waveStyles.confidenceFill, { width: `${f.confidence}%` }]} />
        </View>
        <Text style={waveStyles.confidenceValue}>{f.confidence}%</Text>
      </View>

      <Text style={waveStyles.phrase}>{f.phrase}</Text>
      <Text style={waveStyles.reading} testID="forecast-reading">{f.reading}</Text>

      <View style={waveStyles.actionRow}>
        <Text style={waveStyles.actionHint}>{f.action.hint}</Text>
        {onAction && (
          <TouchableOpacity
            onPress={onAction}
            style={waveStyles.actionButton}
            activeOpacity={0.8}
            testID="forecast-action"
            accessibilityLabel={f.action.label}
          >
            <Text style={waveStyles.actionButtonText}>{f.action.label}</Text>
          </TouchableOpacity>
        )}
      </View>

      {f.resurface && onResurface && f.action.kind !== 'resurface' && (
        <TouchableOpacity
          onPress={onResurface}
          style={waveStyles.resurfaceLink}
          activeOpacity={0.7}
          testID="forecast-resurface"
        >
          <Text style={waveStyles.resurfaceLinkText}>
            a line below the surface — “{truncate(f.resurface.content, 48)}”
          </Text>
        </TouchableOpacity>
      )}

      {typeof savedToday === 'number' && savedToday > 0 && (
        <Text style={waveStyles.savedToday}>{savedToday} caught today</Text>
      )}
    </View>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

function ForecastChip({ label, sub }: { label: string; sub: string }) {
  return (
    <View style={waveStyles.chip} accessibilityLabel={`${sub} ${label}`}>
      <Text style={waveStyles.chipValue}>{label}</Text>
      <Text style={waveStyles.chipSub}>{sub}</Text>
    </View>
  );
}

// ─── CurrentReadingCard ──────────────────────────────────────────────────────
//
// Shown at the top of Depth Stack when a tag current is followed. Compact,
// poetic — borrows surf-forecast cadence to describe the slice without
// turning into a KPI dashboard.

import type { CurrentReading } from '../forecast';

type CurrentReadingCardProps = {
  reading: CurrentReading;
  onAction?: () => void;
  testID?: string;
};

export function CurrentReadingCard({ reading, onAction, testID }: CurrentReadingCardProps) {
  return (
    <View style={currentStyles.container} testID={testID ?? 'current-reading'}>
      <Text style={currentStyles.label}>current reading</Text>
      <Text style={currentStyles.title}>{reading.title}</Text>
      <Text style={currentStyles.description}>{reading.description}</Text>
      {reading.coTag && (
        <Text style={currentStyles.cotag}>often runs with {reading.coTag.split(':').slice(1).join(':')}</Text>
      )}
      <View style={currentStyles.actionRow}>
        <Text style={currentStyles.hint}>{reading.action.hint}</Text>
        {onAction && (
          <TouchableOpacity
            onPress={onAction}
            style={currentStyles.button}
            activeOpacity={0.8}
            testID="current-action"
            accessibilityLabel={reading.action.label}
          >
            <Text style={currentStyles.buttonText}>{reading.action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const currentStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#0E1B2D',
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
  },
  label: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  title: {
    color: Colors.sandLight,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    marginBottom: 2,
  },
  description: {
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  cotag: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  hint: {
    flex: 1,
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
  },
  button: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.amber,
    minHeight: 36,
    justifyContent: 'center',
  },
  buttonText: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    letterSpacing: 1,
  },
});

// Backward-compatible alias for any older imports.
// (kept intentionally — older callers may reference TidalReading)
export const TidalReading = WaveForecast as unknown as React.FC<any>;

const waveStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#0E1B2D',
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
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: Spacing.md,
  },
  heightBlock: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  heightValue: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  heightDash: {
    color: Colors.muted,
    fontSize: FontSizes.xl,
  },
  heightUnit: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  miniChartWrap: {
    flex: 1,
  },
  miniChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 48,
    gap: 4,
  },
  miniBarSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  miniBar: {
    width: '100%',
    borderRadius: 2,
    backgroundColor: '#2E6B8A66',
  },
  miniBarNow: {
    backgroundColor: Colors.amber + 'CC',
  },
  miniAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  miniAxisText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
  },
  miniAxisNow: {
    color: Colors.amber,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  chip: {
    flexBasis: '23%',
    flexGrow: 1,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: '#0A1628',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  chipValue: {
    color: Colors.sandLight,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
  },
  chipSub: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  confidenceLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginRight: Spacing.sm,
    flexShrink: 0,
  },
  confidenceTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#0A1628',
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: Colors.amber + 'BB',
  },
  confidenceValue: {
    color: Colors.sand,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    marginLeft: Spacing.sm,
    width: 36,
    textAlign: 'right',
  },
  phrase: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    textAlign: 'center',
  },
  reading: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  actionHint: {
    flex: 1,
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
  },
  actionButton: {
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    minHeight: 36,
    justifyContent: 'center',
  },
  actionButtonText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    letterSpacing: 1,
  },
  resurfaceLink: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  resurfaceLinkText: {
    color: Colors.sand,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  savedToday: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});

// ─── TidalChart ──────────────────────────────────────────────────────────────
//
// A line tidal chart for Lines/Depth Stack. Replaces the stacked depth
// gauge. Renders a smooth tide curve with high/low markers, a current-time
// indicator, and optional saved-line markers placed along the curve. Pure
// View-based geometry — no SVG dependency.

export type TidalChartMarker = {
  id: number | string;
  /** 0..1 horizontal position along the visible window */
  x: number;
  /** display label, kept short */
  label?: string;
};

type TidalChartProps = {
  /** Lines to seed marker positions, ordered most-recent first. */
  markers?: TidalChartMarker[];
  /** Total saved-line count, surfaced as a quiet sublabel. */
  totalCount?: number;
  /** Override the flood/ebb label; if set, derived from the saved-line rhythm. */
  phaseHint?: 'high' | 'low' | 'flood' | 'ebb';
  testID?: string;
};

const CHART_WIDTH_SAMPLES = 48; // resolution of the polyline
const CHART_HEIGHT = 110;

function buildTideCurve(now: Date) {
  // Render a 24-hour window centred near "now" (-12h .. +12h-ish) so the
  // user sees both a previous high/low and what's coming.
  const baseHours = now.getHours() + now.getMinutes() / 60;
  const points = Array.from({ length: CHART_WIDTH_SAMPLES }, (_, i) => {
    const t = baseHours - 12 + (i / (CHART_WIDTH_SAMPLES - 1)) * 24;
    const phase = (((t % 12.42) + 12.42) % 12.42) / 12.42;
    const level = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
    return { t, level };
  });

  // Identify the two highs and two lows in window for labelling.
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1].level, b = points[i].level, c = points[i + 1].level;
    if (b > a && b > c) highs.push(i);
    if (b < a && b < c) lows.push(i);
  }

  const nowIdx = Math.round(((CHART_WIDTH_SAMPLES - 1) * 12) / 24);
  return { points, highs, lows, nowIdx };
}

function fmtTime(decimalHours: number): string {
  let h = Math.floor(((decimalHours % 24) + 24) % 24);
  const m = Math.round((decimalHours - Math.floor(decimalHours)) * 60);
  const ampm = h < 12 ? 'am' : 'pm';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

export function TidalChart({ markers, totalCount, phaseHint, testID }: TidalChartProps) {
  const now = new Date();
  const curve = buildTideCurve(now);
  const { points, highs, lows, nowIdx } = curve;

  const segments = points.length - 1;
  const segmentPct = 100 / segments;

  // Map indices into chart label/marker info.
  const highMarkers = highs.slice(0, 2).map((i) => ({
    i,
    timeLabel: fmtTime(points[i].t),
  }));
  const lowMarkers = lows.slice(0, 2).map((i) => ({
    i,
    timeLabel: fmtTime(points[i].t),
  }));

  // Determine flood/ebb at "now" for the heading. If a phaseHint is supplied,
  // honour it so the chart reads the saved-line rhythm rather than wall clock.
  const nowPoint = points[nowIdx];
  const next = points[Math.min(points.length - 1, nowIdx + 1)];
  const phaseLabel = phaseHint ?? (next.level >= nowPoint.level ? 'flood' : 'ebb');

  return (
    <View style={chartStyles.container} testID={testID ?? 'tidal-chart'} accessibilityLabel="tidal chart of saved lines">
      <View style={chartStyles.header}>
        <Text style={chartStyles.label}>tide of the archive</Text>
        <Text style={chartStyles.state}>{phaseLabel}</Text>
      </View>

      <View style={chartStyles.chart}>
        {/* horizontal mid-line: the surface */}
        <View style={chartStyles.surfaceLine} />

        {/* curve as a polyline of small rotated segments */}
        {points.slice(0, -1).map((p, i) => {
          const next = points[i + 1];
          const x1 = i * segmentPct;
          const y1 = (1 - p.level) * 100;
          const y2 = (1 - next.level) * 100;
          const dx = segmentPct;
          const dy = y2 - y1;
          // Use top/left/transform to avoid SVG.
          const lengthPct = Math.sqrt(dx * dx + dy * dy);
          // We can't mix % rotation with absolute pixels reliably; instead
          // render small absolutely positioned slabs sized in % of parent.
          const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
          return (
            <View
              key={`seg-${i}`}
              style={[
                chartStyles.segment,
                {
                  left: `${x1}%`,
                  top: `${y1}%`,
                  width: `${lengthPct}%`,
                  transform: [{ rotate: `${angleDeg}deg` }],
                },
              ]}
            />
          );
        })}

        {/* fill below curve (subtle water shade) — built from vertical bars */}
        <View style={chartStyles.fillRow} pointerEvents="none">
          {points.map((p, i) => (
            <View
              key={`fill-${i}`}
              style={[
                chartStyles.fillBar,
                { height: `${(1 - p.level) * 0 + p.level * 100}%` },
              ]}
            />
          ))}
        </View>

        {/* now indicator — vertical amber line */}
        <View style={[chartStyles.nowLine, { left: `${nowIdx * segmentPct}%` }]} />
        <View style={[chartStyles.nowDot, {
          left: `${nowIdx * segmentPct}%`,
          top: `${(1 - points[nowIdx].level) * 100}%`,
        }]} />

        {/* high tide markers */}
        {highMarkers.map((m) => (
          <View
            key={`high-${m.i}`}
            style={[chartStyles.tideMark, {
              left: `${m.i * segmentPct}%`,
              top: `${(1 - points[m.i].level) * 100}%`,
            }]}
          >
            <View style={chartStyles.tideMarkDotHigh} />
          </View>
        ))}
        {/* low tide markers */}
        {lowMarkers.map((m) => (
          <View
            key={`low-${m.i}`}
            style={[chartStyles.tideMark, {
              left: `${m.i * segmentPct}%`,
              top: `${(1 - points[m.i].level) * 100}%`,
            }]}
          >
            <View style={chartStyles.tideMarkDotLow} />
          </View>
        ))}

        {/* saved-line markers placed along the curve */}
        {(markers ?? []).slice(0, 6).map((mk) => {
          const idx = Math.max(0, Math.min(points.length - 1, Math.round(mk.x * (points.length - 1))));
          return (
            <View
              key={`mk-${mk.id}`}
              style={[chartStyles.lineMark, {
                left: `${idx * segmentPct}%`,
                top: `${(1 - points[idx].level) * 100}%`,
              }]}
              accessibilityLabel={`saved line marker ${mk.label ?? mk.id}`}
            />
          );
        })}
      </View>

      <View style={chartStyles.timeAxis}>
        {[...lowMarkers, ...highMarkers]
          .sort((a, b) => a.i - b.i)
          .map((m, idx, arr) => {
            // Avoid label collisions — drop labels too close to neighbours.
            if (idx > 0 && (m.i - arr[idx - 1].i) * segmentPct < 14) return null;
            return (
              <Text
                key={`lbl-${m.i}`}
                style={[chartStyles.timeLabel, { left: `${m.i * segmentPct}%` }]}
              >
                {m.timeLabel}
              </Text>
            );
          })}
        <Text style={[chartStyles.timeLabel, chartStyles.timeLabelNow, { left: `${nowIdx * segmentPct}%` }]}>now</Text>
      </View>

      <View style={chartStyles.legend}>
        <LegendDot color={Colors.amber} label="high tide" />
        <LegendDot color={Colors.sand} label="low tide" />
        <LegendDot color={Colors.saltWhite} label="recent line" hollow />
        {typeof totalCount === 'number' && (
          <Text style={chartStyles.legendMeta}>{totalCount} held in the archive</Text>
        )}
      </View>
    </View>
  );
}

function LegendDot({ color, label, hollow }: { color: string; label: string; hollow?: boolean }) {
  return (
    <View style={chartStyles.legendItem}>
      <View
        style={[
          chartStyles.legendDot,
          {
            backgroundColor: hollow ? 'transparent' : color,
            borderColor: color,
          },
        ]}
      />
      <Text style={chartStyles.legendText}>{label}</Text>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#0E1B2D',
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
  chart: {
    height: CHART_HEIGHT,
    backgroundColor: '#0A1628',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  surfaceLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.6,
  },
  segment: {
    position: 'absolute',
    height: 2,
    backgroundColor: Colors.sand,
    transformOrigin: 'left center',
    borderRadius: 1,
  },
  fillRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    opacity: 0.18,
  },
  fillBar: {
    flex: 1,
    backgroundColor: '#2E6B8A',
  },
  nowLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: Colors.amber + '88',
  },
  nowDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.amber,
    marginLeft: -4,
    marginTop: -4,
    borderWidth: 1,
    borderColor: Colors.deepNavy,
  },
  tideMark: {
    position: 'absolute',
    marginLeft: -5,
    marginTop: -5,
  },
  tideMarkDotHigh: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.amber,
    borderWidth: 1,
    borderColor: Colors.deepNavy,
  },
  tideMarkDotLow: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.sand,
    borderWidth: 1,
    borderColor: Colors.deepNavy,
  },
  lineMark: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.saltWhite,
    marginLeft: -3,
    marginTop: -3,
  },
  timeAxis: {
    height: 16,
    marginTop: Spacing.xs,
    position: 'relative',
  },
  timeLabel: {
    position: 'absolute',
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 0.5,
    transform: [{ translateX: -16 }],
    width: 50,
    textAlign: 'center',
  },
  timeLabelNow: {
    color: Colors.amber,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    marginRight: 6,
  },
  legendText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
  },
  legendMeta: {
    marginLeft: 'auto',
    color: Colors.sand,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
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
