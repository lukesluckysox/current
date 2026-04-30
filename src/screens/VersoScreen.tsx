import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Colors, Fonts, FontSizes, Spacing, Radius,
  VERSO_MODES, VersoMode, PARADOX_TOPICS,
  LOCAL_FALLBACK_LINES,
} from '../theme';
import {
  addLine, getLines, getConfig, setConfig, Line,
} from '../db/database';
import { Header, Pill, Workbench } from '../components';
import { RootStackParamList } from '../../App';
import { generateLine, GenerateBreak, EditOp, editLine, GenerateIntent } from '../llm';
import {
  buildLexicon, findCurrents, dominantBreak,
  readBreakLocal, restraint as readRestraint,
  applyFeedback, emptyStyleHints, StyleHints, ResonanceVote,
} from '../patterns';
import {
  recommendMode, inferVoiceProfile, buildContextPacket, pickFallback,
} from '../lineIntelligence';

const VALID_MODES: VersoMode[] = ['paradox', 'aphorism', 'contradiction', 'aside'];

// Map a possibly-legacy seedMode (e.g. 'complete', 'distill', 'invert') onto
// one of the four supported modes. Old saved lines and old route params do not
// crash; they simply land somewhere sensible.
function resolveMode(raw: string | undefined): VersoMode {
  if (!raw) return 'paradox';
  if ((VALID_MODES as readonly string[]).includes(raw)) return raw as VersoMode;
  if (raw === 'invert' || raw === 'paradox') return 'paradox';
  if (raw === 'distill' || raw === 'complete' || raw === 'aphorism') return 'aphorism';
  if (raw === 'contradiction') return 'contradiction';
  if (raw === 'aside') return 'aside';
  return 'paradox';
}

function localFallback(
  type: GenerateBreak,
  current: string | null,
  voice?: ReturnType<typeof inferVoiceProfile>,
): string {
  const bank = LOCAL_FALLBACK_LINES[type];
  if (!bank || bank.length === 0) return current ?? '';
  // Intelligence-aware pick: filter by quality, bias toward voice profile.
  const picked = pickFallback(bank, type, { exclude: current ?? '', voice });
  if (picked) return picked;
  // Last-ditch random pick if everything got filtered.
  let pick = bank[Math.floor(Math.random() * bank.length)];
  let tries = 0;
  while (pick === current && tries < 5) {
    pick = bank[Math.floor(Math.random() * bank.length)];
    tries++;
  }
  return pick;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Verso'>;
  route: RouteProp<RootStackParamList, 'Verso'>;
};

export default function VersoScreen({ navigation, route }: Props) {
  const seedContent = route.params?.seedContent;
  const initialMode = resolveMode(route.params?.seedMode);
  const seedForecastSource = route.params?.seedForecastSource ?? null;
  const seedLiveBreak = route.params?.seedLiveBreak ?? null;
  const seedLiveArchetype = route.params?.seedLiveArchetype ?? null;
  const seedTide = route.params?.seedTide ?? null;
  const seedTerrain = route.params?.seedTerrain ?? null;
  const seedConstellation = route.params?.seedConstellation ?? null;

  const [mode, setMode] = useState<VersoMode>(initialMode);

  // Free-text shaping canvas. Same UI for all four modes.
  const [shaped, setShaped] = useState(seedContent ?? '');
  // How the canvas should be used when the speaker takes the drop.
  //   'seed'    — hold their words underneath; line is inspired by them.
  //   'reshape' — convert their words into the chosen mode.
  // Only meaningful when the canvas has content; the toggle hides otherwise.
  const [intent, setIntent] = useState<GenerateIntent>('seed');
  const [topic, setTopic] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<EditOp | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [allLines, setAllLines] = useState<Line[]>([]);
  const [styleHints, setStyleHints] = useState<StyleHints>(emptyStyleHints());
  const [lastFeedback, setLastFeedback] = useState<ResonanceVote | null>(null);

  useEffect(() => {
    if (seedContent) setShaped(seedContent);
  }, [seedContent]);

  const load = useCallback(async () => {
    const lines = await getLines();
    setAllLines(lines);
    const raw = await getConfig('style_hints_v1');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StyleHints;
        if (parsed && Array.isArray(parsed.held) && Array.isArray(parsed.wanted)) {
          setStyleHints(parsed);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSaveShaped() {
    if (!shaped.trim()) return;
    const t = customTopic.trim() || topic;
    await addLine({
      content: shaped.trim(),
      mode,
      topic: t ?? null,
    });
    setShaped('');
    setTopic(null);
    setCustomTopic('');
    navigation.navigate('Lines');
  }

  // User-voice profile inferred from saved/favourited lines. Lightweight, no
  // UI; used to bias generation context and local fallback selection.
  const voiceProfile = useMemo(() => inferVoiceProfile(allLines), [allLines]);

  // Recently-saved Verso modes — used by the break reader to avoid pinning
  // the user to a single register.
  const recentModes = useMemo(
    () =>
      [...allLines]
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 6)
        .map((l) => l.mode),
    [allLines],
  );

  // Context packet sent with /api/generate. Built from saved lines, the
  // active fragment's tags, the user's lexicon, voice profile, and any
  // persisted style hints. Stays compact — the server caps further.
  const contextPacket = useMemo(() => {
    const lex = buildLexicon(allLines, 8).map((e) => e.word);
    const cur = findCurrents(allLines, 4).map((c) =>
      c.kind === 'word' ? c.value : `${c.kind}:${c.value}`,
    );
    const dom = dominantBreak(allLines);
    const recommended = recommendMode(shaped, {
      tide: seedTide,
      terrain: seedTerrain,
      constellation: seedConstellation,
      forecastSource: seedForecastSource,
      liveArchetype: seedLiveArchetype,
      dominantMode: dom,
      recentModes,
    });
    return buildContextPacket({
      tide: seedTide,
      terrain: seedTerrain,
      constellation: seedConstellation,
      lexicon: lex,
      currents: cur,
      dominantMode: dom ?? null,
      voiceTokens: voiceProfile.styleTokens,
      forecastSource: seedForecastSource,
      liveBreak: seedLiveBreak,
      liveArchetype: seedLiveArchetype,
      recommendedMode: recommended,
      styleHints: [...styleHints.wanted, ...styleHints.held.slice(0, 4)].slice(0, 6),
    });
  }, [
    allLines, shaped, recentModes, voiceProfile, styleHints,
    seedTide, seedTerrain, seedConstellation,
    seedForecastSource, seedLiveBreak, seedLiveArchetype,
  ]);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setGenerateError(null);
    setLastFeedback(null);
    // Seed: prefer canvas (their own thinking), then custom topic, then chosen
    // topic, then any nav-time seed. A single word/topic/fragment is enough.
    const seed = (shaped.trim() || customTopic.trim() || topic || seedContent || '').toString();
    const previous = shaped;
    // Reshape only applies when the canvas itself holds the seed. If the seed
    // came from a topic chip or nav-time fragment (not currently in the box),
    // fall back to 'seed' so the user's own words aren't silently rewritten.
    const effectiveIntent: GenerateIntent =
      intent === 'reshape' && shaped.trim().length > 0 ? 'reshape' : 'seed';
    try {
      const result = await generateLine(mode, seed, contextPacket, effectiveIntent);
      if (result.ok) {
        setShaped(result.line);
      } else {
        const fallback = localFallback(mode, previous.trim() || null, voiceProfile);
        setShaped(fallback);
        const labels: Record<string, string> = {
          timeout: 'slow connection — local line',
          unavailable: 'live model offline — local line',
          rate_limited: 'too many in a moment — local line',
          empty: 'model went quiet — local line',
          bad_request: 'try a shorter seed',
          network: 'offline — local line',
        };
        setGenerateError(labels[result.error.kind] ?? 'local line');
      }
    } catch {
      setShaped(localFallback(mode, previous.trim() || null, voiceProfile));
      setGenerateError('offline — local line');
    } finally {
      setGenerating(false);
    }
  }

  async function handleEdit(op: EditOp) {
    if (editing || generating || !shaped.trim()) return;
    setEditing(op);
    setGenerateError(null);
    const previous = shaped;
    try {
      const result = await editLine(op, shaped, mode);
      if (result.ok) {
        setShaped(result.line);
      } else {
        setShaped(previous);
        const labels: Record<string, string> = {
          timeout: 'slow connection',
          unavailable: 'live model offline',
          rate_limited: 'too many in a moment',
          empty: 'model went quiet',
          bad_request: 'try a longer line first',
          network: 'offline',
        };
        setGenerateError(labels[result.error.kind] ?? 'edit unavailable');
      }
    } catch {
      setGenerateError('offline');
    } finally {
      setEditing(null);
    }
  }

  async function handleFeedback(vote: ResonanceVote) {
    if (!shaped.trim()) return;
    setLastFeedback(vote);
    const next = applyFeedback(styleHints, vote, shaped);
    setStyleHints(next);
    try {
      await setConfig('style_hints_v1', JSON.stringify(next));
    } catch {
      // best-effort; non-persistent fallback is fine
    }
  }

  const modeMeta = VERSO_MODES.find((m) => m.id === mode)!;

  // Why-this-break recommendation, computed locally from the canvas. Falls
  // back through: rule-based reader (with a reason string), then the wider
  // intelligence-driven recommender (signals + tags + recent-mode context).
  // The wider recommender only contributes when the rule reader is silent
  // and the intelligence-pick differs from the active mode — keeping the
  // surface unchanged when there's nothing to say.
  const breakRead = useMemo(() => {
    const rule = readBreakLocal(shaped);
    if (rule) return rule;
    if (!shaped.trim() || shaped.trim().length < 6) return null;
    const dom = dominantBreak(allLines);
    const intelMode = recommendMode(shaped, {
      dominantMode: dom,
      recentModes,
    });
    if (intelMode === mode) return null;
    return {
      type: intelMode,
      reason: 'a different break may carry this better.',
    } as const;
  }, [shaped, allLines, recentModes, mode]);
  const restraintSig = useMemo(() => readRestraint(shaped), [shaped]);

  const seedLen = shaped.trim().length;
  const seedState =
    seedLen === 0 ? 'blank ocean' :
    seedLen < 40  ? 'small swell' :
    'formed set';

  const placeholder =
    mode === 'paradox'       ? 'a truth that undoes itself…' :
    mode === 'aphorism'      ? 'one line, sharpened…' :
    mode === 'contradiction' ? 'two truths against each other…' :
    /* aside */                'turn it sideways — a slanted observation…';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Verso"
        onBack={() => navigation.goBack()}
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
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Workbench size="normal">
        {/* Mode selector */}
        <View style={styles.modeRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {VERSO_MODES.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.modeTab, mode === m.id && styles.modeTabActive]}
                onPress={() => setMode(m.id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.modeTabText, mode === m.id && styles.modeTabTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <Text style={styles.modeHint} testID={`mode-hint-${mode}`}>{modeMeta.hint}</Text>
        <Text style={styles.modeSubtitle} testID={`mode-subtitle-${mode}`}>
          {modeMeta.subtitle}
        </Text>

        <View style={styles.section}>
          {seedContent && (
            <View style={styles.seedBanner}>
              <Text style={styles.seedLabel}>shaping fragment</Text>
              <Text style={styles.seedText}>{seedContent}</Text>
            </View>
          )}

          {mode === 'paradox' && (
            <>
              <Text style={styles.sectionLabel}>choose a topic (optional)</Text>
              <View style={styles.topicGrid}>
                {PARADOX_TOPICS.map((t) => (
                  <Pill
                    key={t}
                    label={t}
                    active={topic === t}
                    onPress={() => { setTopic(topic === t ? null : t); setCustomTopic(''); }}
                  />
                ))}
              </View>
              <TextInput
                value={customTopic}
                onChangeText={(t) => { setCustomTopic(t); setTopic(null); }}
                placeholder="or name your own topic"
                placeholderTextColor={Colors.muted}
                style={styles.customTopicInput}
                selectionColor={Colors.amber}
              />
            </>
          )}

          <View style={styles.shapingHeader}>
            <Text style={styles.sectionLabel}>{modeMeta.label}</Text>
            <TouchableOpacity
              onPress={handleGenerate}
              style={[styles.generateButton, generating && styles.saveButtonDisabled]}
              activeOpacity={0.8}
              disabled={generating}
              accessibilityLabel={`generate a ${mode} line`}
              testID={`generate-${mode}`}
            >
              <Text style={styles.generateButtonText}>
                {generating ? 'reading the water…' : 'take the drop ✦'}
              </Text>
            </TouchableOpacity>
          </View>
          {shaped.trim().length > 0 && (
            <View style={styles.intentRow} testID={`intent-row-${mode}`}>
              <Text style={styles.intentHint}>your words →</Text>
              <View style={styles.intentPills}>
                <Pill
                  label="seed"
                  active={intent === 'seed'}
                  onPress={() => setIntent('seed')}
                />
                <Pill
                  label="reshape"
                  active={intent === 'reshape'}
                  onPress={() => setIntent('reshape')}
                />
              </View>
            </View>
          )}
          {generateError && (
            <Text style={styles.generateError}>{generateError}</Text>
          )}
          <Text style={styles.seedState} testID={`seed-state-${mode}`}>
            {seedState}
          </Text>
          <TextInput
            value={shaped}
            onChangeText={(t) => { setShaped(t.slice(0, 280)); if (generateError) setGenerateError(null); }}
            placeholder={placeholder}
            placeholderTextColor={Colors.muted}
            style={styles.writeInput}
            multiline
            selectionColor={Colors.amber}
            autoCorrect={false}
            editable={!generating && !editing}
            testID={`canvas-${mode}`}
          />

          {restraintSig && (
            <Text style={styles.restraintText} testID="restraint-signal">
              {restraintSig.message}
            </Text>
          )}

          {breakRead && !restraintSig && (
            <View style={styles.whyBreakRow} testID="why-break">
              <Text style={styles.whyBreakLabel}>break reader · {breakRead.type}</Text>
              <Text style={styles.whyBreakText}>{breakRead.reason}</Text>
              {breakRead.type !== mode && (VALID_MODES as readonly string[]).includes(breakRead.type) && (
                <TouchableOpacity
                  onPress={() => setMode(breakRead.type as VersoMode)}
                  style={styles.whyBreakSwitch}
                  activeOpacity={0.7}
                  accessibilityLabel={`switch to ${breakRead.type}`}
                >
                  <Text style={styles.whyBreakSwitchText}>switch to {breakRead.type} →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {shaped.trim().length > 0 && !restraintSig && (
            <View style={styles.editRow}>
              <Text style={styles.editLabel}>shape this line</Text>
              <View style={styles.editButtons}>
                {(['clearer', 'sharper', 'stranger'] as EditOp[]).map((op) => (
                  <TouchableOpacity
                    key={op}
                    onPress={() => handleEdit(op)}
                    style={[styles.editButton, editing === op && styles.editButtonActive]}
                    activeOpacity={0.75}
                    disabled={!!editing || generating}
                    testID={`edit-${op}`}
                    accessibilityLabel={`make it ${op}`}
                  >
                    <Text style={styles.editButtonText}>
                      {editing === op ? '…' : op}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {shaped.trim().length > 0 && !restraintSig && (
            <View style={styles.feedbackRow}>
              <Text style={styles.feedbackLabel}>resonance</Text>
              {(['held', 'closer', 'too-clean', 'too-soft', 'too-obvious', 'missed'] as ResonanceVote[]).map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => handleFeedback(v)}
                  style={[styles.feedbackChip, lastFeedback === v && styles.feedbackChipActive]}
                  activeOpacity={0.7}
                  testID={`feedback-${v}`}
                  accessibilityLabel={`mark line as ${v}`}
                >
                  <Text style={[styles.feedbackChipText, lastFeedback === v && styles.feedbackChipTextActive]}>
                    {v.replace('-', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.saveRow}>
            <Text style={styles.charCount}>
              {shaped.length > 0 ? 280 - shaped.length : ''}
            </Text>
            <TouchableOpacity
              style={[styles.saveButton, !shaped.trim() && styles.saveButtonDisabled]}
              onPress={handleSaveShaped}
              activeOpacity={0.8}
              disabled={!shaped.trim()}
            >
              <Text style={styles.saveButtonText}>keep it</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomPad} />
        </Workbench>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.deepNavy,
  },
  headerIcon: {
    color: Colors.sand,
    fontSize: FontSizes.xl,
    fontFamily: Fonts.sans,
  },
  modeRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modeTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  modeTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.amber,
  },
  modeTabText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    letterSpacing: 1,
  },
  modeTabTextActive: {
    color: Colors.saltWhite,
  },
  modeHint: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  modeSubtitle: {
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xs,
    paddingHorizontal: Spacing.lg,
    paddingTop: 2,
    paddingBottom: Spacing.xs,
  },
  seedState: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  section: {
    padding: Spacing.lg,
  },
  sectionLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  generateButton: {
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
  },
  generateButtonText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    letterSpacing: 1,
  },
  seedBanner: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
    paddingLeft: Spacing.md,
    marginBottom: Spacing.lg,
  },
  seedLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  seedText: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.lg,
    lineHeight: 28,
  },
  topicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
  },
  customTopicInput: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  shapingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  intentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
  },
  intentHint: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginRight: Spacing.sm,
  },
  intentPills: {
    flexDirection: 'row',
  },
  generateError: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xs,
    marginBottom: Spacing.sm,
  },
  writeInput: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    lineHeight: 34,
    minHeight: 120,
    marginBottom: Spacing.md,
    textAlignVertical: 'top',
  },
  saveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  saveButton: {
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  bottomPad: {
    height: 48,
  },
  restraintText: {
    color: Colors.amberLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.sm,
  },
  whyBreakRow: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
    paddingLeft: Spacing.sm,
    marginBottom: Spacing.md,
  },
  whyBreakLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  whyBreakText: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
  },
  whyBreakSwitch: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
  },
  whyBreakSwitchText: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
  },
  editRow: {
    marginBottom: Spacing.sm,
  },
  editLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  editButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  editButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 72,
    alignItems: 'center',
  },
  editButtonActive: {
    borderColor: Colors.amber,
    backgroundColor: Colors.amber + '22',
  },
  editButtonText: {
    color: Colors.sand,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    letterSpacing: 1,
  },
  feedbackRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  feedbackLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginRight: Spacing.xs,
  },
  feedbackChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  feedbackChipActive: {
    borderColor: Colors.amber,
    backgroundColor: Colors.amber + '22',
  },
  feedbackChipText: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xs,
  },
  feedbackChipTextActive: {
    color: Colors.sandLight,
  },
});
