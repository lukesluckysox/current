import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Colors, Fonts, FontSizes, Spacing, Radius,
  VERSO_TEMPLATES, VERSO_MODES, VersoMode, PARADOX_TOPICS,
  COMPLETE_BOARDS, COMPLETE_BREAK_FALLBACKS, CompleteBoard,
  LOCAL_FALLBACK_LINES,
} from '../theme';
import {
  addLine, addCustomTemplate, getCustomTemplates, deleteCustomTemplate,
  getLines, getConfig, setConfig, Line,
} from '../db/database';
import { Header, EmptyState, Pill } from '../components';
import { RootStackParamList } from '../../App';
import { generateLine, generateBreaks, GenerateBreak, EditOp, editLine } from '../llm';
import {
  buildLexicon, findCurrents, dominantBreak,
  readBreakLocal, restraint as readRestraint,
  applyFeedback, emptyStyleHints, StyleHints, ResonanceVote,
} from '../patterns';

const LLM_MODES: VersoMode[] = ['aphorism', 'paradox', 'contradiction'];

function isLlmMode(mode: VersoMode): mode is GenerateBreak {
  return LLM_MODES.includes(mode);
}

function localFallback(type: GenerateBreak, current: string | null): string {
  const bank = LOCAL_FALLBACK_LINES[type];
  if (!bank || bank.length === 0) return current ?? '';
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

function parseTemplate(template: string): string[] {
  return template.split(' _ ');
}

function buildCompletedLine(template: string, fills: string[]): string {
  const parts = parseTemplate(template);
  return parts.map((part, i) => (i < fills.length ? part + fills[i] : part)).join('');
}

// Pick a fresh fallback break from a board, avoiding the currently-selected
// one if possible. Used when the LLM is unreachable.
function pickFallbackBreak(
  board: CompleteBoard,
  current: string | null,
): string {
  const bank = COMPLETE_BREAK_FALLBACKS[board];
  if (!bank || bank.length === 0) return current ?? '';
  if (bank.length === 1) return bank[0];
  let pick = bank[Math.floor(Math.random() * bank.length)];
  let tries = 0;
  while (pick === current && tries < 5) {
    pick = bank[Math.floor(Math.random() * bank.length)];
    tries++;
  }
  return pick;
}

// If a fragment or tags are present, seed the *first* blank with a
// fragment-ish word so the chosen break feels rooted in the user's material.
// We never fill more than one blank — the user always finishes.
function seedFillsFor(
  template: string,
  seedContent: string | undefined,
  seedTopic: string | null,
): string[] {
  const blankCount = parseTemplate(template).length - 1;
  if (blankCount <= 0) return [];
  const fills: string[] = Array(blankCount).fill('');
  const seed = (seedTopic ?? '').trim() || pickKeyword(seedContent);
  if (seed) fills[0] = seed;
  return fills;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'is', 'it',
  'i', 'you', 'we', 'my', 'your', 'this', 'that', 'with', 'for', 'as', 'at',
  'be', 'are', 'was', 'were', 'been', 'so', 'if', 'than', 'then', 'just',
  'when', 'where', 'how', 'what', 'who', 'why',
]);

function pickKeyword(text: string | undefined): string {
  if (!text) return '';
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\s']/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  if (words.length === 0) return '';
  return words[words.length - 1];
}

export default function VersoScreen({ navigation, route }: Props) {
  const seedContent = route.params?.seedContent;
  const seedMode = (route.params?.seedMode as VersoMode | undefined) ?? 'complete';

  const [mode, setMode] = useState<VersoMode>(seedMode);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(VERSO_TEMPLATES[0]);
  const [fills, setFills] = useState<string[]>([]);
  const [customTemplates, setCustomTemplates] = useState<Array<{ id: number; template: string }>>([]);
  const [showCustomEntry, setShowCustomEntry] = useState(false);
  const [customTemplate, setCustomTemplate] = useState('');
  const [activeBoard, setActiveBoard] = useState<CompleteBoard>('confession');
  const [generatedBreaks, setGeneratedBreaks] = useState<string[]>([]);
  const [generatingBreaks, setGeneratingBreaks] = useState(false);
  const [breaksError, setBreaksError] = useState<string | null>(null);
  const [breaksSource, setBreaksSource] = useState<'llm' | 'fallback' | null>(null);

  // Free-text shaping (paradox / distill / aphorism / invert / contradiction)
  const [shaped, setShaped] = useState(seedContent ?? '');
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

  const blankCount = parseTemplate(selectedTemplate).length - 1;
  const currentFills = fills.slice(0, blankCount);
  const allFilled = currentFills.length === blankCount && currentFills.every((f) => f.trim());
  const completedLine = allFilled ? buildCompletedLine(selectedTemplate, currentFills) : null;

  const load = useCallback(async () => {
    const custom = await getCustomTemplates();
    setCustomTemplates(custom);
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

  function selectTemplate(t: string) {
    setSelectedTemplate(t);
    setFills(seedFillsFor(t, seedContent, null));
    setShowCustomEntry(false);
  }

  // Generate a fresh set of breaks for the given board via the LLM. Falls
  // back to the static bank on error/timeout. Selects the first generated
  // break so the user has something fillable immediately.
  async function handleGenerateBreaks(board: CompleteBoard = activeBoard) {
    setActiveBoard(board);
    setShowCustomEntry(false);
    if (generatingBreaks) return;
    setGeneratingBreaks(true);
    setBreaksError(null);
    try {
      const result = await generateBreaks(board, 4, contextPacket);
      if (result.ok) {
        setGeneratedBreaks(result.breaks);
        setBreaksSource('llm');
        const first = result.breaks[0];
        if (first) {
          setSelectedTemplate(first);
          setFills(seedFillsFor(first, seedContent, null));
        }
      } else {
        const fallback = pickFallbackBreak(board, selectedTemplate);
        setGeneratedBreaks([fallback]);
        setBreaksSource('fallback');
        setSelectedTemplate(fallback);
        setFills(seedFillsFor(fallback, seedContent, null));
        const labels: Record<string, string> = {
          timeout: 'slow connection — local breaks',
          unavailable: 'live model offline — local breaks',
          rate_limited: 'too many in a moment — local breaks',
          empty: 'model went quiet — local breaks',
          bad_request: 'try a different board',
          network: 'offline — local breaks',
        };
        setBreaksError(labels[result.error.kind] ?? 'local breaks');
      }
    } catch {
      const fallback = pickFallbackBreak(board, selectedTemplate);
      setGeneratedBreaks([fallback]);
      setBreaksSource('fallback');
      setSelectedTemplate(fallback);
      setFills(seedFillsFor(fallback, seedContent, null));
      setBreaksError('offline — local breaks');
    } finally {
      setGeneratingBreaks(false);
    }
  }

  async function handleDeleteCustomBreak(id: number, template: string) {
    await deleteCustomTemplate(id);
    if (selectedTemplate === template) {
      const next = generatedBreaks[0] ?? VERSO_TEMPLATES[0];
      setSelectedTemplate(next);
      setFills(seedFillsFor(next, seedContent, null));
    }
    await load();
  }

  function setFill(index: number, value: string) {
    const next = [...fills];
    next[index] = value;
    setFills(next);
  }

  async function handleSaveComplete() {
    if (!completedLine) return;
    await addLine({
      content: completedLine,
      mode: 'complete',
      template: selectedTemplate,
    });
    setFills([]);
    navigation.navigate('Lines');
  }

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

  // Context packet sent with /api/generate. Built from the saved lines, the
  // active fragment's tags, the user's lexicon, and any persisted style hints.
  const contextPacket = useMemo(() => {
    const lex = buildLexicon(allLines, 8).map((e) => e.word);
    const cur = findCurrents(allLines, 4).map((c) =>
      c.kind === 'word' ? c.value : `${c.kind}:${c.value}`,
    );
    const dom = dominantBreak(allLines);
    return {
      tide: null,
      terrain: null,
      constellation: null,
      lexicon: lex,
      currents: cur,
      dominantBreak: dom ?? null,
      styleHints: [...styleHints.wanted, ...styleHints.held.slice(0, 4)].slice(0, 6),
    };
  }, [allLines, styleHints]);

  async function handleGenerateShaped() {
    if (!isLlmMode(mode) || generating) return;
    setGenerating(true);
    setGenerateError(null);
    setLastFeedback(null);
    // Seed: prefer the user's free-text canvas (their own thinking) over the
    // navigation-time seedContent, since the canvas may have been edited.
    const seed = (shaped.trim() || customTopic.trim() || topic || seedContent || '').toString();
    const previous = shaped;
    try {
      const result = await generateLine(mode, seed, contextPacket);
      if (result.ok) {
        setShaped(result.line);
      } else {
        // Fall back to a different local line, never overwrite with a duplicate.
        const fallback = localFallback(mode, previous.trim() || null);
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
      setShaped(localFallback(mode, previous.trim() || null));
      setGenerateError('offline — local line');
    } finally {
      setGenerating(false);
    }
  }

  async function handleEdit(op: EditOp) {
    if (!isLlmMode(mode) || editing || generating || !shaped.trim()) return;
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

  async function handleSaveCustomTemplate() {
    const t = customTemplate.trim();
    if (!t || !t.includes(' _ ')) {
      Alert.alert('Template needs at least one blank', 'Use _ (underscore with spaces) for each blank.');
      return;
    }
    await addCustomTemplate(t);
    selectTemplate(t);
    setCustomTemplate('');
    setShowCustomEntry(false);
    await load();
  }

  // The break rail shows: freshly generated breaks (from the LLM or fallback),
  // then the user's saved custom breaks, then the built-in starter set.
  // De-duped by string, preserving order.
  const allBreaks = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of generatedBreaks) {
      if (b && !seen.has(b)) { seen.add(b); out.push(b); }
    }
    for (const c of customTemplates) {
      if (c.template && !seen.has(c.template)) { seen.add(c.template); out.push(c.template); }
    }
    for (const b of VERSO_TEMPLATES) {
      if (b && !seen.has(b)) { seen.add(b); out.push(b); }
    }
    return out;
  }, [generatedBreaks, customTemplates]);

  const customTemplateSet = useMemo(
    () => new Map(customTemplates.map((c) => [c.template, c.id])),
    [customTemplates]
  );

  const modeMeta = VERSO_MODES.find((m) => m.id === mode)!;

  // Why-this-break recommendation, computed locally from the canvas. Updates
  // as the user types but stays cheap (regex-based) — no network calls.
  const breakRead = useMemo(() => readBreakLocal(shaped), [shaped]);
  // Restraint signal: when the fragment is too thin to shape.
  const restraintSig = useMemo(() => readRestraint(shaped), [shaped]);

  // Seed-state language: how much material is on the canvas?
  // blank ocean (no seed) → small swell (a few words) → formed set (most lines).
  const seedLen = shaped.trim().length;
  const seedState =
    seedLen === 0 ? 'blank ocean' :
    seedLen < 40  ? 'small swell' :
    'formed set';

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

        {mode === 'complete' ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>pick a board</Text>
              <Text style={styles.sectionAside}>choose the posture · then generate or pick a break.</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.familyScroll}
              >
                {COMPLETE_BOARDS.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.familyChip, activeBoard === b.id && styles.familyChipActive]}
                    onPress={() => handleGenerateBreaks(b.id)}
                    activeOpacity={0.75}
                    accessibilityLabel={`generate ${b.label} breaks`}
                    testID={`board-${b.id}`}
                  >
                    <Text style={[styles.familyChipText, activeBoard === b.id && styles.familyChipTextActive]}>
                      {b.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.generateRow}>
                <Text style={styles.familyHint}>
                  {COMPLETE_BOARDS.find((b) => b.id === activeBoard)?.hint}
                </Text>
                <TouchableOpacity
                  onPress={() => handleGenerateBreaks()}
                  style={[styles.generateButton, generatingBreaks && styles.saveButtonDisabled]}
                  activeOpacity={0.8}
                  disabled={generatingBreaks}
                  accessibilityLabel="generate breaks"
                  testID="generate-breaks"
                >
                  <Text style={styles.generateButtonText}>
                    {generatingBreaks
                      ? 'reading the water…'
                      : generatedBreaks.length === 0 ? 'generate breaks ✦' : 'another set ↻'}
                  </Text>
                </TouchableOpacity>
              </View>
              {breaksError && (
                <Text style={styles.generateError} testID="breaks-error">{breaksError}</Text>
              )}

              <Text style={styles.sectionLabel}>
                {generatedBreaks.length > 0
                  ? (breaksSource === 'fallback' ? 'breaks · local fallback' : 'generated breaks')
                  : 'or choose a break'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateScroll}>
                {allBreaks.map((t) => {
                  const customId = customTemplateSet.get(t);
                  return (
                    <View key={t} style={styles.breakChipWrap}>
                      <TouchableOpacity
                        style={[styles.templateChip, selectedTemplate === t && styles.templateChipActive]}
                        onPress={() => selectTemplate(t)}
                        activeOpacity={0.75}
                        testID={`break-chip-${t.slice(0, 24)}`}
                      >
                        <Text
                          style={[styles.templateChipText, selectedTemplate === t && styles.templateChipTextActive]}
                          numberOfLines={1}
                        >
                          {t}
                        </Text>
                      </TouchableOpacity>
                      {customId !== undefined && (
                        <TouchableOpacity
                          onPress={() => handleDeleteCustomBreak(customId, t)}
                          style={styles.breakDelete}
                          activeOpacity={0.6}
                          accessibilityLabel="delete custom break"
                          testID={`break-delete-${customId}`}
                        >
                          <Text style={styles.breakDeleteText}>×</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                <TouchableOpacity
                  style={styles.templateChip}
                  onPress={() => setShowCustomEntry(!showCustomEntry)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.templateChipText}>+ write your own</Text>
                </TouchableOpacity>
              </ScrollView>

              {showCustomEntry && (
                <View style={styles.customTemplateRow}>
                  <TextInput
                    value={customTemplate}
                    onChangeText={setCustomTemplate}
                    placeholder="Use _ for blanks (e.g. _ is the price of _)"
                    placeholderTextColor={Colors.muted}
                    style={styles.customTemplateInput}
                    selectionColor={Colors.amber}
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={handleSaveCustomTemplate}
                    style={styles.miniButton}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.miniButtonText}>add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>fill the blanks</Text>
              <Text style={styles.templateDisplay}>
                {parseTemplate(selectedTemplate).map((part, i) => (
                  <React.Fragment key={i}>
                    <Text style={styles.templatePart}>{part}</Text>
                    {i < blankCount && (
                      <Text style={[styles.templateBlank, currentFills[i]?.trim() && styles.templateBlankFilled]}>
                        {currentFills[i]?.trim() || '___'}
                      </Text>
                    )}
                  </React.Fragment>
                ))}
              </Text>

              <View style={styles.fillInputs}>
                {Array.from({ length: blankCount }).map((_, i) => (
                  <View key={i} style={styles.fillRow}>
                    <Text style={styles.fillLabel}>{i + 1}</Text>
                    <TextInput
                      value={fills[i] ?? ''}
                      onChangeText={(v) => setFill(i, v)}
                      placeholder={`blank ${i + 1}`}
                      placeholderTextColor={Colors.muted}
                      style={styles.fillInput}
                      selectionColor={Colors.amber}
                      autoCorrect={false}
                    />
                  </View>
                ))}
              </View>

              {completedLine && (
                <View style={styles.preview}>
                  <Text style={styles.previewLabel}>completed line</Text>
                  <Text style={styles.previewLine}>{completedLine}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveButton, !allFilled && styles.saveButtonDisabled]}
                onPress={handleSaveComplete}
                activeOpacity={0.8}
                disabled={!allFilled}
              >
                <Text style={styles.saveButtonText}>save line</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.section}>
            {/* Shaping modes (paradox / distill / aphorism / invert): a single
                free-text canvas. Topic chips appear for paradox. */}

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
              {isLlmMode(mode) && (
                <TouchableOpacity
                  onPress={handleGenerateShaped}
                  style={[styles.generateButton, generating && styles.saveButtonDisabled]}
                  activeOpacity={0.8}
                  disabled={generating}
                  accessibilityLabel={`take the drop on ${mode}`}
                  testID={`generate-${mode}`}
                >
                  <Text style={styles.generateButtonText}>
                    {generating ? 'reading the water…' : 'take the drop ✦'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {isLlmMode(mode) && generateError && (
              <Text style={styles.generateError}>{generateError}</Text>
            )}
            {isLlmMode(mode) && (
              <Text style={styles.seedState} testID={`seed-state-${mode}`}>
                {seedState}
              </Text>
            )}
            <TextInput
              value={shaped}
              onChangeText={(t) => { setShaped(t.slice(0, 280)); if (generateError) setGenerateError(null); }}
              placeholder={
                mode === 'paradox' ? 'a truth that undoes itself…' :
                mode === 'distill' ? 'shorter, truer…' :
                mode === 'aphorism' ? 'one line, sharpened…' :
                mode === 'contradiction' ? 'two truths against each other…' :
                'flip it…'
              }
              placeholderTextColor={Colors.muted}
              style={styles.writeInput}
              multiline
              selectionColor={Colors.amber}
              autoCorrect={false}
              editable={!generating && !editing}
            />

            {restraintSig && (
              <Text style={styles.restraintText} testID="restraint-signal">
                {restraintSig.message}
              </Text>
            )}

            {breakRead && !restraintSig && (mode === 'aphorism' || mode === 'paradox' || mode === 'contradiction') && (
              <View style={styles.whyBreakRow} testID="why-break">
                <Text style={styles.whyBreakLabel}>break reader · {breakRead.type}</Text>
                <Text style={styles.whyBreakText}>{breakRead.reason}</Text>
                {breakRead.type !== mode && (
                  <TouchableOpacity
                    onPress={() => setMode(breakRead.type)}
                    style={styles.whyBreakSwitch}
                    activeOpacity={0.7}
                    accessibilityLabel={`switch to ${breakRead.type}`}
                  >
                    <Text style={styles.whyBreakSwitchText}>switch to {breakRead.type} →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {isLlmMode(mode) && shaped.trim().length > 0 && !restraintSig && (
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

            {isLlmMode(mode) && shaped.trim().length > 0 && !restraintSig && (
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
        )}

        <View style={styles.bottomPad} />
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
  sectionAside: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.md,
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
  templateScroll: {
    marginBottom: Spacing.sm,
  },
  familyScroll: {
    marginBottom: Spacing.sm,
  },
  familyChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  familyChipActive: {
    borderColor: Colors.amber,
    backgroundColor: Colors.amber + '22',
  },
  familyChipText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  familyChipTextActive: {
    color: Colors.sandLight,
  },
  generateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  familyHint: {
    flex: 1,
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginRight: Spacing.sm,
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
  breakChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  breakDelete: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.xs,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  breakDeleteText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    lineHeight: 16,
  },
  templateChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    maxWidth: 220,
  },
  templateChipActive: {
    borderColor: Colors.amber,
    backgroundColor: Colors.amber + '18',
  },
  templateChipText: {
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
  },
  templateChipTextActive: {
    color: Colors.sandLight,
  },
  customTemplateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  customTemplateInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    paddingVertical: Spacing.sm,
  },
  miniButton: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  miniButtonText: {
    color: Colors.sand,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  templateDisplay: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    lineHeight: 34,
    color: Colors.saltWhite,
    marginBottom: Spacing.lg,
  },
  templatePart: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
  },
  templateBlank: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    textDecorationLine: 'underline',
  },
  templateBlankFilled: {
    color: Colors.amber,
    textDecorationLine: 'none',
  },
  fillInputs: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  fillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fillLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    width: 20,
  },
  fillInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    paddingVertical: Spacing.sm,
  },
  preview: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
  },
  previewLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  previewLine: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    lineHeight: 32,
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
