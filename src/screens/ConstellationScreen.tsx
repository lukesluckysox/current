import React, { useState, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';
import {
  getConstellationEntries,
  addConstellationEntry,
  deleteConstellationEntry,
  ConstellationEntry,
} from '../db/database';
import { Header, EmptyState } from '../components';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Constellation'>;
};

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const NEARNESS_OPTIONS = ['close', 'present', 'drifting', 'distant', 'approaching', 'unknown'];
const RECIPROCITY_OPTIONS = ['mutual', 'one-sided', 'uncertain', 'lapsed', 'asymmetric'];
const TIE_KINDS = ['friend', 'partner', 'family', 'colleague', 'mentor', 'circle', 'stranger', 'other'];

type ScreenView = 'field' | 'table' | 'orbit';

export default function ConstellationScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [tieKind, setTieKind] = useState('');
  const [nearness, setNearness] = useState('');
  const [reciprocity, setReciprocity] = useState('');
  const [tension, setTension] = useState('');
  const [circle, setCircle] = useState('');
  const [entries, setEntries] = useState<ConstellationEntry[]>([]);
  const [view, setView] = useState<ScreenView>('field');

  const load = useCallback(async () => {
    const data = await getConstellationEntries();
    setEntries(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSave() {
    if (!name.trim()) return;
    await addConstellationEntry({
      name: name.trim(),
      tie_kind: tieKind.trim() || null,
      nearness: nearness || null,
      reciprocity: reciprocity || null,
      tension: tension.trim() || null,
      circle: circle.trim() || null,
    });
    setName('');
    setTieKind('');
    setNearness('');
    setReciprocity('');
    setTension('');
    setCircle('');
    setView('table');
    await load();
  }

  async function handleDelete(id: number) {
    Alert.alert('Remove from the field?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteConstellationEntry(id);
          await load();
        },
      },
    ]);
  }

  function nearnessColor(n: string | null): string {
    const map: Record<string, string> = {
      close: Colors.amber,
      present: Colors.sand,
      drifting: Colors.mutedLight,
      distant: Colors.muted,
      approaching: Colors.sandLight,
      unknown: Colors.border,
    };
    return n ? (map[n] ?? Colors.muted) : Colors.muted;
  }

  // Group entries by circle for Table view
  const byCircle: Record<string, ConstellationEntry[]> = {};
  for (const entry of entries) {
    const key = entry.circle ?? 'ungrouped';
    if (!byCircle[key]) byCircle[key] = [];
    byCircle[key].push(entry);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Constellation"
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            onPress={() => {
              const cycle: ScreenView[] = ['field', 'table', 'orbit'];
              const next = cycle[(cycle.indexOf(view) + 1) % cycle.length];
              setView(next);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.viewToggle}>
              {view === 'field' ? '⊙' : view === 'table' ? '◈' : '◎'}
            </Text>
          </TouchableOpacity>
        }
      />

      {view === 'field' ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Text style={styles.introText}>
              Map the social field — lightly, observationally.
            </Text>
          </View>

          {/* Name */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Person or group</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="who is present in the field right now?"
              placeholderTextColor={Colors.muted}
              style={styles.fieldInput}
              selectionColor={Colors.amber}
            />
          </View>

          {/* Tie kind */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Kind of tie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {TIE_KINDS.map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.optionChip, tieKind === k && styles.optionChipActive]}
                  onPress={() => setTieKind(tieKind === k ? '' : k)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.optionChipText, tieKind === k && styles.optionChipTextActive]}>
                    {k}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Nearness */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Nearness</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {NEARNESS_OPTIONS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.optionChip,
                    nearness === n && { borderColor: nearnessColor(n), backgroundColor: nearnessColor(n) + '18' },
                  ]}
                  onPress={() => setNearness(nearness === n ? '' : n)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.optionChipText, nearness === n && { color: nearnessColor(n) }]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Reciprocity */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Reciprocity</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {RECIPROCITY_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.optionChip, reciprocity === r && styles.optionChipActive]}
                  onPress={() => setReciprocity(reciprocity === r ? '' : r)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.optionChipText, reciprocity === r && styles.optionChipTextActive]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Tension / affinity */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Tension, affinity, or pull</Text>
            <TextInput
              value={tension}
              onChangeText={setTension}
              placeholder="what is the charge between you?"
              placeholderTextColor={Colors.muted}
              style={styles.fieldInput}
              selectionColor={Colors.amber}
            />
          </View>

          {/* Circle */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Circle or shared context</Text>
            <TextInput
              value={circle}
              onChangeText={setCircle}
              placeholder="work, family, the old group, city friends…"
              placeholderTextColor={Colors.muted}
              style={styles.fieldInput}
              selectionColor={Colors.amber}
            />
          </View>

          {/* Suggestions */}
          {(tension || nearness === 'drifting' || nearness === 'distant') && (
            <View style={styles.suggestionsPanel}>
              <Text style={styles.suggestionsLabel}>this could feed</Text>
              {tension && (
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionTarget}>Paradox → </Text>
                  <Text style={styles.suggestionText}>find the contradiction in the tension</Text>
                </View>
              )}
              {(nearness === 'drifting' || nearness === 'distant') && (
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionTarget}>Verso → </Text>
                  <Text style={styles.suggestionText}>complete a line about distance or absence</Text>
                </View>
              )}
              {name && (
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionTarget}>Drift → </Text>
                  <Text style={styles.suggestionText}>catch a fragment about {name.split(' ')[0]}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.saveArea}>
            <TouchableOpacity
              style={[styles.saveButton, !name.trim() && styles.saveButtonDisabled]}
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={!name.trim()}
            >
              <Text style={styles.saveButtonText}>add to the field</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomPad} />
        </ScrollView>
      ) : view === 'table' ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionNote}>
              The table — a readable arrangement of the circle
            </Text>
            {entries.length === 0 ? (
              <EmptyState
                title="the field is empty"
                subtitle="add people or circles to begin reading the constellation"
              />
            ) : (
              Object.entries(byCircle).map(([key, group]) => (
                <View key={key} style={styles.tableGroup}>
                  <Text style={styles.tableGroupLabel}>
                    {key === 'ungrouped' ? '—' : key}
                  </Text>
                  {group.map((entry) => (
                    <TouchableOpacity
                      key={entry.id}
                      style={styles.tableEntry}
                      onLongPress={() => handleDelete(entry.id)}
                      activeOpacity={0.9}
                      delayLongPress={600}
                    >
                      <View style={[styles.nearnessDot, { backgroundColor: nearnessColor(entry.nearness) }]} />
                      <View style={styles.tableEntryContent}>
                        <Text style={styles.tableEntryName}>{entry.name}</Text>
                        <View style={styles.tableEntryMeta}>
                          {entry.tie_kind && (
                            <Text style={styles.tableMeta}>{entry.tie_kind}</Text>
                          )}
                          {entry.nearness && (
                            <Text style={[styles.tableMeta, { color: nearnessColor(entry.nearness) }]}>
                              {entry.nearness}
                            </Text>
                          )}
                          {entry.reciprocity && (
                            <Text style={styles.tableMeta}>{entry.reciprocity}</Text>
                          )}
                        </View>
                        {entry.tension && (
                          <Text style={styles.tableTension}>{entry.tension}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
          </View>
          <View style={styles.bottomPad} />
        </ScrollView>
      ) : (
        // Orbit view — barometer of pull and movement
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionNote}>
              Orbit — quiet barometer of pull, drift, and movement
            </Text>
            {entries.length === 0 ? (
              <EmptyState
                title="no one in orbit"
                subtitle="add a person or circle to begin"
              />
            ) : (
              entries.map((entry) => {
                const color = nearnessColor(entry.nearness);
                const orbitLabel =
                  entry.nearness === 'close' ? 'inner'
                  : entry.nearness === 'present' ? 'near'
                  : entry.nearness === 'approaching' ? 'approaching'
                  : entry.nearness === 'drifting' ? 'drifting out'
                  : entry.nearness === 'distant' ? 'outer'
                  : 'unknown';

                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={styles.orbitEntry}
                    onLongPress={() => handleDelete(entry.id)}
                    activeOpacity={0.9}
                    delayLongPress={600}
                  >
                    <Text style={[styles.orbitLabel, { color }]}>{orbitLabel}</Text>
                    <View style={styles.orbitContent}>
                      <Text style={styles.orbitName}>{entry.name}</Text>
                      {entry.tension && (
                        <Text style={styles.orbitTension}>{entry.tension}</Text>
                      )}
                      {entry.reciprocity && (
                        <Text style={styles.orbitReciprocity}>{entry.reciprocity}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
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
  intro: {
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  introText: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    lineHeight: 24,
  },
  fieldSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  fieldLabel: {
    color: Colors.sand,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    marginBottom: Spacing.sm,
  },
  fieldInput: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.lg,
    paddingVertical: Spacing.xs,
  },
  optionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  optionChipActive: {
    borderColor: Colors.amber,
    backgroundColor: Colors.amber + '18',
  },
  optionChipText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  optionChipTextActive: {
    color: Colors.amber,
  },
  suggestionsPanel: {
    margin: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
  },
  suggestionsLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  suggestionTarget: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    minWidth: 80,
  },
  suggestionText: {
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    flex: 1,
    lineHeight: 20,
  },
  saveArea: {
    padding: Spacing.lg,
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
  section: {
    padding: Spacing.lg,
  },
  sectionNote: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  tableGroup: {
    marginBottom: Spacing.xl,
  },
  tableGroupLabel: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  tableEntry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  nearnessDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: Spacing.md,
  },
  tableEntryContent: {
    flex: 1,
  },
  tableEntryName: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    marginBottom: 2,
  },
  tableEntryMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: 2,
  },
  tableMeta: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 0.5,
  },
  tableTension: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  orbitEntry: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: 'flex-start',
  },
  orbitLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    width: 90,
    paddingTop: 4,
  },
  orbitContent: {
    flex: 1,
  },
  orbitName: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    marginBottom: 2,
  },
  orbitTension: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  orbitReciprocity: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  bottomPad: {
    height: 48,
  },
});
