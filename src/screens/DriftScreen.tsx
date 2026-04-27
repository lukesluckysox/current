import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Colors, Fonts, FontSizes, Spacing, Radius,
  TIDE_STATES, TERRAIN_HINTS,
} from '../theme';
import {
  addLine, getLines, Line,
} from '../db/database';
import { Header, SwellInput, WaveForecast } from '../components';
import { RootStackParamList } from '../../App';
import { computeForecast, Forecast } from '../forecast';
import {
  getLiveConditions, deriveInnerVector, matchInnerToLive, LiveMatch,
} from '../surfData';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Drift'>;
};

type Sheet = 'tide' | 'terrain' | 'constellation' | null;

export default function DriftScreen({ navigation }: Props) {
  const [content, setContent] = useState('');
  const [tide, setTide] = useState<string | null>(null);
  const [terrain, setTerrain] = useState<string | null>(null);
  const [constellation, setConstellation] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [surfaced, setSurfaced] = useState<Line | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [savedToday, setSavedToday] = useState(0);
  const [allLines, setAllLines] = useState<Line[]>([]);
  const surfacedOpacity = useRef(new Animated.Value(0)).current;

  // Live surf-data resonance. We fetch real marine/wind conditions for a
  // curated set of breaks once per focus (cache throttles to 30 min) and
  // pick the break whose live water most resembles the inner read.
  const [liveStatus, setLiveStatus] = useState<'idle' | 'loading' | 'ready' | 'offline'>('idle');
  const [liveData, setLiveData] = useState<Awaited<ReturnType<typeof getLiveConditions>> | null>(null);

  const load = useCallback(async () => {
    const recent = await getLines();
    setAllLines(recent);
    const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    setSavedToday(recent.filter((l) => l.created_at >= startOfDay).length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Pull live surf data on focus. Cached at the module level so re-focusing
  // is essentially free until the TTL expires.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLiveStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
      getLiveConditions()
        .then((data) => {
          if (cancelled) return;
          if (data && data.length > 0) {
            setLiveData(data);
            setLiveStatus('ready');
          } else {
            setLiveStatus('offline');
          }
        })
        .catch(() => {
          if (!cancelled) setLiveStatus('offline');
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // Compute the forecast from real signals each render. Cheap — pure function
  // over already-loaded state — and lets it react as the user types.
  const forecast: Forecast = React.useMemo(
    () => computeForecast(
      allLines,
      { text: content, tide, terrain, constellation },
    ),
    [allLines, content, tide, terrain, constellation]
  );

  // Match the inner read against live break conditions. Falls back to
  // the engine's deterministic resemblance if live data isn't ready.
  const liveMatch: LiveMatch | null = React.useMemo(() => {
    if (!liveData || liveData.length === 0) return null;
    const inner = deriveInnerVector({
      swellHeight: forecast.swellHeight,
      swellHeightHigh: forecast.swellHeightHigh,
      period: forecast.period,
      texture: forecast.texture,
      tidePhase: forecast.tidePhase,
      source: forecast.source,
      conditions: forecast.conditions,
      direction: forecast.direction,
    });
    return matchInnerToLive(inner, liveData);
  }, [liveData, forecast]);

  async function handleSave() {
    if (!content.trim()) return;
    await addLine({
      content: content.trim(),
      mode: 'fragment',
      tide,
      terrain,
      constellation,
    });
    setContent('');
    setTide(null);
    setTerrain(null);
    setConstellation(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
    await load();
  }

  function shapeInVerso(seedMode?: string) {
    if (!content.trim()) return;
    navigation.navigate('Verso', { seedContent: content.trim(), seedMode });
  }

  // Route the forecast's recommended action. If we have an unsaved fragment,
  // shape/save it. If empty, resurface a candidate or surface a reshape on
  // the most recent line.
  function handleForecastAction() {
    const a = forecast.action;
    if (a.kind === 'save') {
      if (content.trim()) handleSave();
      return;
    }
    if (a.kind === 'shape') {
      if (content.trim()) {
        shapeInVerso(a.mode);
      } else if (forecast.resurface) {
        showResurface(forecast.resurface);
      }
      return;
    }
    if (a.kind === 'reshape' && forecast.resurface) {
      navigation.navigate('Verso', {
        seedContent: forecast.resurface.content,
        seedMode: a.mode ?? 'aphorism',
        seedLineId: forecast.resurface.id,
      });
      return;
    }
    if (a.kind === 'reshape' && allLines[0]) {
      const last = allLines[0];
      navigation.navigate('Verso', {
        seedContent: last.content,
        seedMode: a.mode ?? 'aphorism',
        seedLineId: last.id,
      });
      return;
    }
    if (a.kind === 'resurface' && forecast.resurface) {
      showResurface(forecast.resurface);
    }
  }

  function showResurface(line: Line) {
    setSurfaced(line);
    surfacedOpacity.setValue(0);
    Animated.timing(surfacedOpacity, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }

  function openSurfaced() {
    if (surfaced) navigation.navigate('LineDetail', { lineId: surfaced.id });
  }

  function reshapeSurfaced() {
    if (!surfaced) return;
    navigation.navigate('Verso', {
      seedContent: surfaced.content,
      seedMode: 'aphorism',
      seedLineId: surfaced.id,
    });
  }

  function releaseSurfaced() {
    setSurfaced(null);
  }

  const remaining = 200 - content.length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Current"
        rightAction={
          <TouchableOpacity
            onPress={() => navigation.navigate('Lines')}
            activeOpacity={0.7}
          >
            <Text style={styles.headerIcon}>≡</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.captureArea}>
          <Text style={styles.driftLabel}>drift</Text>
          <SwellInput
            value={content}
            onChangeText={setContent}
            placeholder="drop in…"
            multiline
            maxLength={200}
            style={styles.captureInput}
            containerStyle={styles.captureInputContainer}
            autoCorrect={false}
            autoFocus
          />

          {/* Optional context chips */}
          <View style={styles.chipRow}>
            <ContextChip
              label={tide ?? 'tide'}
              active={!!tide}
              onPress={() => setSheet(sheet === 'tide' ? null : 'tide')}
              onClear={tide ? () => setTide(null) : undefined}
            />
            <ContextChip
              label={terrain ?? 'terrain'}
              active={!!terrain}
              onPress={() => setSheet(sheet === 'terrain' ? null : 'terrain')}
              onClear={terrain ? () => setTerrain(null) : undefined}
            />
            <ContextChip
              label={constellation ? `with ${constellation}` : 'with'}
              active={!!constellation}
              onPress={() => setSheet(sheet === 'constellation' ? null : 'constellation')}
              onClear={constellation ? () => setConstellation(null) : undefined}
            />
          </View>

          {sheet === 'tide' && (
            <BottomSheet
              title="state of the water"
              options={TIDE_STATES}
              selected={tide}
              onSelect={(v) => { setTide(v); setSheet(null); }}
            />
          )}
          {sheet === 'terrain' && (
            <BottomSheet
              title="interior weather"
              options={TERRAIN_HINTS}
              selected={terrain}
              onSelect={(v) => { setTerrain(v); setSheet(null); }}
            />
          )}
          {sheet === 'constellation' && (
            <ConstellationSheet
              value={constellation}
              onConfirm={(name) => { setConstellation(name); setSheet(null); }}
            />
          )}

          <View style={styles.actionRow}>
            <Text style={styles.charCount}>
              {savedFlash ? 'kept ✓' : (content.length > 0 ? remaining : '')}
            </Text>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.shapeButton, !content.trim() && styles.disabled]}
                onPress={() => shapeInVerso()}
                activeOpacity={0.8}
                disabled={!content.trim()}
              >
                <Text style={styles.shapeButtonText}>shape →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, !content.trim() && styles.disabled]}
                onPress={handleSave}
                activeOpacity={0.8}
                disabled={!content.trim()}
              >
                <Text style={styles.saveButtonText}>keep it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <WaveForecast
          forecast={forecast}
          savedToday={savedToday}
          liveMatch={liveMatch}
          liveStatus={liveStatus}
          onAction={handleForecastAction}
          onResurface={() => forecast.resurface && showResurface(forecast.resurface)}
        />

        {surfaced && (
          <Animated.View style={[styles.surfaced, { opacity: surfacedOpacity }]}>
            <Text style={styles.surfacedLabel}>a line below the surface</Text>
            <Text style={styles.surfacedContent}>{surfaced.content}</Text>
            <View style={styles.surfacedActions}>
              <TouchableOpacity
                onPress={openSurfaced}
                style={styles.surfacedButton}
                activeOpacity={0.8}
                accessibilityLabel="open this line"
              >
                <Text style={styles.surfacedButtonText}>view</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={reshapeSurfaced}
                style={styles.surfacedButton}
                activeOpacity={0.8}
                accessibilityLabel="reshape this line"
              >
                <Text style={styles.surfacedButtonText}>reshape</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={releaseSurfaced}
                style={styles.surfacedRelease}
                activeOpacity={0.8}
                accessibilityLabel="release this line back below"
              >
                <Text style={styles.surfacedReleaseText}>release</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Lines')}
            activeOpacity={0.7}
          >
            <Text style={styles.footerLink}>depth stack</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Verso')}
            activeOpacity={0.7}
          >
            <Text style={styles.footerLink}>verso</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.7}
          >
            <Text style={styles.footerLink}>settings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ContextChip({
  label, active, onPress, onClear,
}: { label: string; active: boolean; onPress: () => void; onClear?: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {onClear && (
        <TouchableOpacity onPress={onClear} hitSlop={8} style={styles.chipClear}>
          <Text style={[styles.chipText, active && styles.chipTextActive]}>×</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function BottomSheet({
  title, options, selected, onSelect,
}: {
  title: string;
  options: readonly string[];
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  return (
    <View style={styles.sheet}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <View style={styles.sheetOptions}>
        {options.map((o) => (
          <TouchableOpacity
            key={o}
            onPress={() => onSelect(o)}
            style={[styles.sheetOption, selected === o && styles.sheetOptionActive]}
            activeOpacity={0.75}
          >
            <Text style={[styles.sheetOptionText, selected === o && styles.sheetOptionTextActive]}>
              {o}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ConstellationSheet({
  value, onConfirm,
}: { value: string | null; onConfirm: (v: string) => void }) {
  const [name, setName] = useState(value ?? '');
  return (
    <View style={styles.sheet}>
      <Text style={styles.sheetTitle}>who's in this</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="a name, a relation, a presence"
        placeholderTextColor={Colors.muted}
        style={styles.sheetInput}
        selectionColor={Colors.amber}
        autoFocus
        onSubmitEditing={() => name.trim() && onConfirm(name.trim())}
      />
      <TouchableOpacity
        style={[styles.sheetConfirm, !name.trim() && styles.disabled]}
        onPress={() => name.trim() && onConfirm(name.trim())}
        disabled={!name.trim()}
        activeOpacity={0.8}
      >
        <Text style={styles.sheetConfirmText}>tag</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.deepNavy,
  },
  scroll: {
    flex: 1,
  },
  headerIcon: {
    color: Colors.sand,
    fontSize: FontSizes.xl,
    fontFamily: Fonts.sans,
  },
  driftLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  captureArea: {
    padding: Spacing.lg,
  },
  captureInputContainer: {
    borderColor: Colors.borderLight,
    paddingVertical: Spacing.md,
  },
  captureInput: {
    fontSize: FontSizes.xl,
    lineHeight: 32,
    minHeight: 100,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  chipActive: {
    backgroundColor: Colors.amber + '22',
    borderColor: Colors.amber,
  },
  chipText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  chipTextActive: {
    color: Colors.sandLight,
  },
  chipClear: {
    marginLeft: Spacing.xs,
  },
  sheet: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetTitle: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  sheetOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sheetOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sheetOptionActive: {
    borderColor: Colors.amber,
    backgroundColor: Colors.amber,
  },
  sheetOptionText: {
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
  },
  sheetOptionTextActive: {
    color: Colors.deepNavy,
    fontFamily: Fonts.serif,
  },
  sheetInput: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sheetConfirm: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
  },
  sheetConfirmText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  charCount: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  shapeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shapeButtonText: {
    color: Colors.sand,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  saveButton: {
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
  },
  saveButtonText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
  surfaced: {
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
  },
  surfacedLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  surfacedContent: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xl,
    lineHeight: 32,
  },
  surfacedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  surfacedButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.amber,
  },
  surfacedButtonText: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    letterSpacing: 1,
  },
  surfacedRelease: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  surfacedReleaseText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.xl,
  },
  footerLink: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  bottomPad: {
    height: 32,
  },
});
