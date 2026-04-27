import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';
import { getLines, deleteLine, Line, LineMode } from '../db/database';
import { Header, EmptyState, Pill, TidalChart, TidalChartMarker, CurrentReadingCard, Workbench } from '../components';
import { RootStackParamList, LineFilter } from '../../App';
import { readCurrent } from '../forecast';
import { confirm } from '../confirm';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Lines'>;
  route: RouteProp<RootStackParamList, 'Lines'>;
};

const SURFACE_COUNT = 3;
const PAGE_SIZE = 8;

const FILTERS: Array<{ id: 'all' | LineMode; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'fragment', label: 'fragments' },
  { id: 'paradox', label: 'paradox' },
  { id: 'aphorism', label: 'aphorism' },
  { id: 'contradiction', label: 'contradiction' },
  { id: 'aside', label: 'aside' },
];

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Surface a line's tag values into a uniform list of clickable currents.
function tagsForLine(line: Line): LineFilter[] {
  const out: LineFilter[] = [];
  if (line.tide) out.push({ kind: 'tide', value: line.tide });
  if (line.terrain) out.push({ kind: 'terrain', value: line.terrain });
  if (line.constellation) out.push({ kind: 'constellation', value: line.constellation });
  if (line.topic) out.push({ kind: 'topic', value: line.topic });
  if (line.mode && line.mode !== 'fragment') out.push({ kind: 'mode', value: line.mode });
  return out;
}

// Map up to 6 most-recent lines onto the tidal chart's 0..1 x-axis.
// "Now" sits at x ≈ 0.5; older lines drift left toward yesterday's tide.
// Spreads markers across the 24h window using log-scaled age so a cluster
// from the same hour doesn't all collapse onto the same point.
function buildLineMarkers(lines: Line[]): TidalChartMarker[] {
  const recent = lines.slice(0, 6);
  if (recent.length === 0) return [];
  const nowSec = Math.floor(Date.now() / 1000);
  const dayWindow = 86400;
  return recent.map((l) => {
    const ageSec = Math.max(0, nowSec - l.created_at);
    // log-scaled age: 0s → 0; 1h → ~0.18; 6h → ~0.5; 24h+ → 1
    const t = Math.min(1, Math.log10(1 + ageSec / 60) / Math.log10(1 + dayWindow / 60));
    const x = Math.max(0.02, Math.min(0.5, 0.5 - t * 0.5));
    return { id: l.id, x, label: l.content.slice(0, 24) };
  });
}

// Saved-line rhythm → tide phase. Recent cluster = high; long quiet = low;
// uptick = flood; slowdown = ebb. Drives the chart's heading in place of
// wall-clock derivation.
function phaseFromRhythm(lines: Line[]): 'high' | 'low' | 'flood' | 'ebb' {
  if (lines.length === 0) return 'low';
  const nowSec = Math.floor(Date.now() / 1000);
  const hour = 3600;
  const dayWindow = 24 * hour;
  const recent1h = lines.filter((l) => nowSec - l.created_at <= hour).length;
  const last24 = lines.filter((l) => nowSec - l.created_at <= dayWindow).length;
  const prev24 = lines.filter((l) => {
    const age = nowSec - l.created_at;
    return age > dayWindow && age <= dayWindow * 2;
  }).length;
  if (recent1h >= 3) return 'high';
  const lastTs = Math.max(...lines.map((l) => l.created_at));
  const sinceLastH = (nowSec - lastTs) / hour;
  if (sinceLastH > 18) return 'low';
  if (last24 > prev24 + 1) return 'flood';
  if (last24 + 1 < prev24) return 'ebb';
  if (last24 >= 4) return 'high';
  return last24 >= 2 ? 'flood' : 'ebb';
}

function lineMatchesFilter(line: Line, f: LineFilter): boolean {
  switch (f.kind) {
    case 'tide': return line.tide === f.value;
    case 'terrain': return line.terrain === f.value;
    case 'constellation': return line.constellation === f.value;
    case 'topic': return line.topic === f.value;
    case 'mode': return line.mode === f.value;
  }
}

function filterLabel(f: LineFilter): string {
  switch (f.kind) {
    case 'tide': return `tide · ${f.value}`;
    case 'terrain': return `terrain · ${f.value}`;
    case 'constellation': return `with · ${f.value}`;
    case 'topic': return `topic · ${f.value}`;
    case 'mode': return `mode · ${f.value}`;
  }
}

export default function LinesScreen({ navigation, route }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [modeFilter, setModeFilter] = useState<'all' | LineMode>('all');
  const [tagFilter, setTagFilter] = useState<LineFilter | null>(route.params?.filter ?? null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    const data = await getLines();
    setLines(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Keep tag filter in sync if a new one is passed in via navigation.
  React.useEffect(() => {
    if (route.params?.filter) {
      setTagFilter(route.params.filter);
      setPage(0);
    }
  }, [route.params?.filter]);

  const filteredLines = useMemo(() => {
    let result = lines;
    if (modeFilter !== 'all') result = result.filter((l) => l.mode === modeFilter);
    if (tagFilter) result = result.filter((l) => lineMatchesFilter(l, tagFilter));
    return result;
  }, [lines, modeFilter, tagFilter]);

  const surface = filteredLines.slice(0, SURFACE_COUNT);
  const deeper = filteredLines.slice(SURFACE_COUNT);
  const totalPages = Math.max(1, Math.ceil(deeper.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageLines = deeper.slice(pageStart, pageStart + PAGE_SIZE);

  function followCurrent(f: LineFilter) {
    setTagFilter(f);
    setPage(0);
  }

  function clearCurrent() {
    setTagFilter(null);
    setPage(0);
  }

  async function handleRelease(line: Line) {
    const ok = await confirm({
      title: 'Release this line?',
      message: 'It will leave the archive.',
      confirmLabel: 'Release',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    await deleteLine(line.id);
    await load();
  }

  const totalCount = filteredLines.length;

  return (
    <View style={styles.container}>
      <Header title="Depth Stack" onBack={() => navigation.goBack()} />

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Workbench size="wide">
        <TidalChart
          markers={buildLineMarkers(filteredLines)}
          totalCount={totalCount}
          phaseHint={phaseFromRhythm(filteredLines)}
          testID="depth-stack-chart"
        />

        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {FILTERS.map((f) => (
              <Pill
                key={f.id}
                label={f.label}
                active={modeFilter === f.id}
                onPress={() => { setModeFilter(f.id); setPage(0); }}
              />
            ))}
          </ScrollView>
        </View>

        {tagFilter && (
          <View style={styles.currentBanner} testID="current-banner">
            <Text style={styles.currentLabel}>following a current</Text>
            <View style={styles.currentRow}>
              <Text style={styles.currentValue}>{filterLabel(tagFilter)}</Text>
              <TouchableOpacity
                onPress={clearCurrent}
                style={styles.currentClear}
                activeOpacity={0.7}
                accessibilityLabel="clear current"
                testID="clear-current"
              >
                <Text style={styles.currentClearText}>clear current ×</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {tagFilter && filteredLines.length > 0 && (() => {
          const reading = readCurrent(tagFilter.kind, tagFilter.value, filteredLines);
          return (
            <CurrentReadingCard
              reading={reading}
              onAction={() => {
                // Route the recommended action: shape seeds Verso with the
                // first line of this current as material; reshape opens the
                // oldest in this slice; otherwise open the first.
                const a = reading.action;
                if (a.kind === 'shape') {
                  const seed = filteredLines[0];
                  if (seed) {
                    navigation.navigate('Verso', {
                      seedContent: seed.content,
                      seedMode: a.mode,
                      seedLineId: seed.id,
                    });
                  }
                  return;
                }
                if (a.kind === 'reshape') {
                  const oldest = filteredLines[filteredLines.length - 1];
                  if (oldest) {
                    navigation.navigate('Verso', {
                      seedContent: oldest.content,
                      seedMode: a.mode ?? 'aphorism',
                      seedLineId: oldest.id,
                    });
                  }
                  return;
                }
                // fallback: open the first line
                const first = filteredLines[0];
                if (first) navigation.navigate('LineDetail', { lineId: first.id });
              }}
            />
          );
        })()}

        {totalCount === 0 ? (
          <EmptyState
            title={tagFilter ? 'no lines on this current' : 'open water'}
            subtitle={tagFilter ? 'follow another current, or clear it' : 'drop in · shape it · keep it'}
          />
        ) : (
          <>
            <DepthBand label="surface" sublabel="the three most recent lines" />
            {surface.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                onPress={() => navigation.navigate('LineDetail', { lineId: line.id })}
                onTagPress={followCurrent}
                onRelease={() => handleRelease(line)}
              />
            ))}

            {deeper.length > 0 && (
              <>
                <DepthBand
                  label={safePage === 0 ? 'deeper water' : `depth · page ${safePage + 1} / ${totalPages}`}
                  sublabel={`${deeper.length} ${deeper.length === 1 ? 'line' : 'lines'} kept below`}
                />
                {pageLines.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    onPress={() => navigation.navigate('LineDetail', { lineId: line.id })}
                    onTagPress={followCurrent}
                    onRelease={() => handleRelease(line)}
                  />
                ))}

                <View style={styles.pager}>
                  <TouchableOpacity
                    onPress={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={safePage === 0}
                    style={[styles.pagerButton, safePage === 0 && styles.disabled]}
                    activeOpacity={0.7}
                    testID="depth-prev"
                  >
                    <Text style={styles.pagerText}>↑ shallower</Text>
                  </TouchableOpacity>
                  <Text style={styles.pagerStatus}>
                    {safePage + 1} / {totalPages}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={safePage >= totalPages - 1}
                    style={[styles.pagerButton, safePage >= totalPages - 1 && styles.disabled]}
                    activeOpacity={0.7}
                    testID="depth-next"
                  >
                    <Text style={styles.pagerText}>deeper ↓</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}

        <View style={styles.bottomPad} />
        </Workbench>
      </ScrollView>
    </View>
  );
}

function DepthBand({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <View style={styles.band}>
      <Text style={styles.bandLabel}>{label}</Text>
      {sublabel && <Text style={styles.bandSublabel}>{sublabel}</Text>}
    </View>
  );
}

function LineRow({
  line, onPress, onTagPress, onRelease,
}: {
  line: Line;
  onPress: () => void;
  onTagPress: (f: LineFilter) => void;
  onRelease: () => void;
}) {
  const tags = tagsForLine(line);
  return (
    <TouchableOpacity
      style={styles.entry}
      onPress={onPress}
      activeOpacity={0.75}
      testID={`line-row-${line.id}`}
      accessibilityLabel={`open line ${line.id}`}
    >
      <Text style={styles.entryContent} numberOfLines={3}>{line.content}</Text>

      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map((t) => (
            <TouchableOpacity
              key={`${t.kind}:${t.value}`}
              onPress={(e) => {
                if ((e as any)?.stopPropagation) (e as any).stopPropagation();
                onTagPress(t);
              }}
              activeOpacity={0.7}
              style={styles.tag}
              accessibilityLabel={`follow current ${filterLabel(t)}`}
              testID={`current-${t.kind}-${t.value}`}
            >
              <Text style={styles.tagText}>{filterLabel(t)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.entryFooter}>
        <Text style={styles.entryDate}>{formatDate(line.created_at)}</Text>
        <View style={styles.footerRight}>
          {line.is_seed === 1 && <Text style={styles.seedIcon}>sample</Text>}
          {line.is_favorite === 1 && <Text style={styles.starIcon}>★</Text>}
          <TouchableOpacity
            onPress={(e) => {
              if ((e as any)?.stopPropagation) (e as any).stopPropagation();
              onRelease();
            }}
            activeOpacity={0.6}
            style={styles.releaseButton}
            accessibilityLabel="release this line — remove from archive"
            testID={`release-${line.id}`}
            hitSlop={8}
          >
            <Text style={styles.releaseText}>release</Text>
          </TouchableOpacity>
          <Text style={styles.openHint}>open →</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.deepNavy,
  },
  filterBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  currentBanner: {
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
    marginBottom: Spacing.xs,
  },
  currentLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  currentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentValue: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
  },
  currentClear: {
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.sm,
  },
  currentClearText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  band: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  bandLabel: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  bandSublabel: {
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginTop: 2,
    lineHeight: 20,
  },
  entry: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  entryContent: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    lineHeight: 28,
    marginBottom: Spacing.xs,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  tagText: {
    color: Colors.mutedLight,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
  },
  entryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryDate: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  starIcon: {
    color: Colors.amber,
    fontSize: FontSizes.md,
  },
  seedIcon: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  openHint: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
  },
  releaseButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  releaseText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pager: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  pagerButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pagerText: {
    color: Colors.sand,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  pagerStatus: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
  },
  disabled: {
    opacity: 0.3,
  },
  bottomPad: {
    height: 48,
  },
});
