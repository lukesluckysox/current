import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius, VERSO_TEMPLATES } from '../theme';
import {
  getVersoEntries,
  addVersoEntry,
  toggleVersoFavorite,
  deleteVersoEntry,
  addCustomTemplate,
  getCustomTemplates,
  VersoEntry,
} from '../db/database';
import { Header, EmptyState } from '../components';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Verso'>;
};

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseTemplate(template: string): string[] {
  return template.split(' _ ');
}

function buildCompletedLine(template: string, fills: string[]): string {
  const parts = parseTemplate(template);
  return parts.map((part, i) => (i < fills.length ? part + fills[i] : part)).join('');
}

export default function VersoScreen({ navigation }: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>(VERSO_TEMPLATES[0]);
  const [fills, setFills] = useState<string[]>([]);
  const [entries, setEntries] = useState<VersoEntry[]>([]);
  const [customTemplates, setCustomTemplates] = useState<string[]>([]);
  const [showCustomEntry, setShowCustomEntry] = useState(false);
  const [customTemplate, setCustomTemplate] = useState('');
  const [view, setView] = useState<'compose' | 'collection'>('compose');
  const saveOpacity = useRef(new Animated.Value(0)).current;

  const blankCount = parseTemplate(selectedTemplate).length - 1;
  const currentFills = fills.slice(0, blankCount);
  const allFilled = currentFills.length === blankCount && currentFills.every((f) => f.trim());
  const completedLine = allFilled
    ? buildCompletedLine(selectedTemplate, currentFills)
    : null;

  const load = useCallback(async () => {
    const [data, custom] = await Promise.all([getVersoEntries(), getCustomTemplates()]);
    setEntries(data);
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

  async function handleSave() {
    if (!completedLine) return;
    await addVersoEntry(selectedTemplate, completedLine);
    setFills([]);
    setView('collection');
    await load();
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

  async function handleToggleFavorite(entry: VersoEntry) {
    await toggleVersoFavorite(entry.id, entry.is_favorite === 0);
    await load();
  }

  async function handleDelete(id: number) {
    Alert.alert('Remove this line?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteVersoEntry(id);
          await load();
        },
      },
    ]);
  }

  async function handleShare(line: string) {
    try {
      await Share.share({ message: line });
    } catch {}
  }

  const allTemplates = [...VERSO_TEMPLATES, ...customTemplates];

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
            onPress={() => setView(view === 'compose' ? 'collection' : 'compose')}
            activeOpacity={0.7}
          >
            <Text style={styles.viewToggle}>{view === 'compose' ? '≡' : '✦'}</Text>
          </TouchableOpacity>
        }
      />

      {view === 'compose' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Template selector */}
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

          {/* Fill-in area */}
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
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={!allFilled}
            >
              <Text style={styles.saveButtonText}>save to collection</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomPad} />
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            {entries.length === 0 ? (
              <EmptyState
                title="no lines saved yet"
                subtitle="complete a template to build your collection"
              />
            ) : (
              entries.map((entry) => (
                <View key={entry.id} style={styles.collectionEntry}>
                  <Text style={styles.collectionLine}>{entry.completed_line}</Text>
                  <Text style={styles.collectionTemplate}>{entry.template}</Text>
                  <View style={styles.collectionMeta}>
                    <Text style={styles.collectionDate}>{formatDate(entry.created_at)}</Text>
                    <View style={styles.collectionActions}>
                      <TouchableOpacity
                        onPress={() => handleToggleFavorite(entry)}
                        style={styles.actionButton}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.actionIcon, entry.is_favorite === 1 && styles.favoriteActive]}>
                          ★
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleShare(entry.completed_line)}
                        style={styles.actionButton}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionIcon}>↑</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDelete(entry.id)}
                        style={styles.actionButton}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionIcon}>×</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
          <View style={styles.bottomPad} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.deepNavy,
  },
  viewToggle: {
    color: Colors.sand,
    fontSize: FontSizes.xl,
    fontFamily: Fonts.sans,
  },
  section: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  saveButton: {
    backgroundColor: Colors.amber,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  collectionEntry: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  collectionLine: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    lineHeight: 32,
    marginBottom: Spacing.xs,
  },
  collectionTemplate: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.sm,
  },
  collectionMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collectionDate: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
  },
  collectionActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  actionIcon: {
    color: Colors.muted,
    fontSize: FontSizes.lg,
    fontFamily: Fonts.sans,
  },
  favoriteActive: {
    color: Colors.amber,
  },
  bottomPad: {
    height: 48,
  },
});
