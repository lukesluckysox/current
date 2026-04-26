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
} from '../theme';
import {
  addLine, addCustomTemplate, getCustomTemplates,
} from '../db/database';
import { Header, EmptyState, Pill } from '../components';
import { RootStackParamList } from '../../App';

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

export default function VersoScreen({ navigation, route }: Props) {
  const seedContent = route.params?.seedContent;
  const seedMode = (route.params?.seedMode as VersoMode | undefined) ?? 'complete';

  const [mode, setMode] = useState<VersoMode>(seedMode);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(VERSO_TEMPLATES[0]);
  const [fills, setFills] = useState<string[]>([]);
  const [customTemplates, setCustomTemplates] = useState<string[]>([]);
  const [showCustomEntry, setShowCustomEntry] = useState(false);
  const [customTemplate, setCustomTemplate] = useState('');

  // Free-text shaping (paradox / distill / aphorism / invert)
  const [shaped, setShaped] = useState(seedContent ?? '');
  const [topic, setTopic] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState('');

  useEffect(() => {
    if (seedContent) setShaped(seedContent);
  }, [seedContent]);

  const blankCount = parseTemplate(selectedTemplate).length - 1;
  const currentFills = fills.slice(0, blankCount);
  const allFilled = currentFills.length === blankCount && currentFills.every((f) => f.trim());
  const completedLine = allFilled ? buildCompletedLine(selectedTemplate, currentFills) : null;

  const load = useCallback(async () => {
    const custom = await getCustomTemplates();
    setCustomTemplates(custom.map((c) => c.template));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function selectTemplate(t: string) {
    setSelectedTemplate(t);
    setFills([]);
    setShowCustomEntry(false);
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

  const allTemplates = useMemo(
    () => [...VERSO_TEMPLATES, ...customTemplates],
    [customTemplates]
  );

  const modeMeta = VERSO_MODES.find((m) => m.id === mode)!;

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
        <Text style={styles.modeHint}>{modeMeta.hint}</Text>

        {mode === 'complete' ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>choose a template</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateScroll}>
                {allTemplates.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.templateChip, selectedTemplate === t && styles.templateChipActive]}
                    onPress={() => selectTemplate(t)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[styles.templateChipText, selectedTemplate === t && styles.templateChipTextActive]}
                      numberOfLines={1}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
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

            <Text style={styles.sectionLabel}>{modeMeta.label}</Text>
            <TextInput
              value={shaped}
              onChangeText={(t) => setShaped(t.slice(0, 280))}
              placeholder={
                mode === 'paradox' ? 'a truth that undoes itself…' :
                mode === 'distill' ? 'shorter, truer…' :
                mode === 'aphorism' ? 'one line, sharpened…' :
                'flip it…'
              }
              placeholderTextColor={Colors.muted}
              style={styles.writeInput}
              multiline
              selectionColor={Colors.amber}
              autoCorrect={false}
            />

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
});
