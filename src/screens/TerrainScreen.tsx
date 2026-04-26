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
  getTerrainEntries,
  addTerrainEntry,
  deleteTerrainEntry,
  TerrainEntry,
} from '../db/database';
import { Header, EmptyState } from '../components';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Terrain'>;
};

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type TerrainField = {
  key: keyof Pick<TerrainEntry, 'cadence' | 'exposure' | 'traction' | 'resonance'>;
  label: string;
  descriptor: string;
  placeholder: string;
};

const FIELDS: TerrainField[] = [
  {
    key: 'cadence',
    label: 'Cadence',
    descriptor: 'aliveness, energy, rhythm',
    placeholder: 'how alive does this day feel?',
  },
  {
    key: 'exposure',
    label: 'Exposure',
    descriptor: 'influences, atmospheres, inputs',
    placeholder: 'what are you absorbing right now?',
  },
  {
    key: 'traction',
    label: 'Traction',
    descriptor: 'what has grip on attention',
    placeholder: 'what keeps pulling focus?',
  },
  {
    key: 'resonance',
    label: 'Resonance',
    descriptor: 'what echoes after contact',
    placeholder: 'a line, song, or impression still circling',
  },
];

export default function TerrainScreen({ navigation }: Props) {
  const [cadence, setCadence] = useState('');
  const [exposure, setExposure] = useState('');
  const [traction, setTraction] = useState('');
  const [resonance, setResonance] = useState('');
  const [conditionTitle, setConditionTitle] = useState('');
  const [entries, setEntries] = useState<TerrainEntry[]>([]);
  const [view, setView] = useState<'read' | 'log'>('read');

  const load = useCallback(async () => {
    const data = await getTerrainEntries();
    setEntries(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const setters: Record<string, (v: string) => void> = {
    cadence: setCadence,
    exposure: setExposure,
    traction: setTraction,
    resonance: setResonance,
  };

  const values: Record<string, string> = {
    cadence,
    exposure,
    traction,
    resonance,
  };

  const hasAny = [cadence, exposure, traction, resonance].some((v) => v.trim());

  async function handleSave() {
    if (!hasAny) return;
    await addTerrainEntry({
      cadence: cadence.trim() || null,
      exposure: exposure.trim() || null,
      traction: traction.trim() || null,
      resonance: resonance.trim() || null,
      condition_title: conditionTitle.trim() || null,
    });
    setCadence('');
    setExposure('');
    setTraction('');
    setResonance('');
    setConditionTitle('');
    setView('log');
    await load();
  }

  async function handleDelete(id: number) {
    Alert.alert('Remove this reading?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteTerrainEntry(id);
          await load();
        },
      },
    ]);
  }

  const latestEntry = entries[0];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Terrain"
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            onPress={() => setView(view === 'read' ? 'log' : 'read')}
            activeOpacity={0.7}
          >
            <Text style={styles.viewToggle}>{view === 'read' ? '≡' : '◎'}</Text>
          </TouchableOpacity>
        }
      />

      {view === 'read' ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Text style={styles.introText}>
              Name the present interior weather — lightly.
            </Text>
          </View>

          {FIELDS.map((field) => (
            <View key={field.key} style={styles.fieldSection}>
              <View style={styles.fieldHeader}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <Text style={styles.fieldDescriptor}>{field.descriptor}</Text>
              </View>
              <TextInput
                value={values[field.key]}
                onChangeText={setters[field.key]}
                placeholder={field.placeholder}
                placeholderTextColor={Colors.muted}
                style={styles.fieldInput}
                selectionColor={Colors.amber}
                multiline
              />
            </View>
          ))}

          <View style={styles.conditionSection}>
            <Text style={styles.fieldLabel}>Condition title</Text>
            <Text style={styles.fieldDescriptor}>one phrase to name the current state</Text>
            <TextInput
              value={conditionTitle}
              onChangeText={setConditionTitle}
              placeholder="e.g. low pressure, wide open, between things"
              placeholderTextColor={Colors.muted}
              style={styles.conditionInput}
              selectionColor={Colors.amber}
            />
          </View>

          {hasAny && (
            <View style={styles.suggestionsPanel}>
              <Text style={styles.suggestionsLabel}>this could feed</Text>
              {cadence && (
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionTarget}>Tide → </Text>
                  <Text style={styles.suggestionText}>name the energy as ocean state</Text>
                </View>
              )}
              {resonance && (
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionTarget}>Drift → </Text>
                  <Text style={styles.suggestionText}>catch what's still circling as a line</Text>
                </View>
              )}
              {traction && (
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionTarget}>Verso → </Text>
                  <Text style={styles.suggestionText}>complete a sentence about attention</Text>
                </View>
              )}
              {exposure && (
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionTarget}>Paradox → </Text>
                  <Text style={styles.suggestionText}>find the contradiction in the influence</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.saveArea}>
            <TouchableOpacity
              style={[styles.saveButton, !hasAny && styles.saveButtonDisabled]}
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={!hasAny}
            >
              <Text style={styles.saveButtonText}>log this reading</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomPad} />
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.logSection}>
            {entries.length === 0 ? (
              <EmptyState
                title="no readings yet"
                subtitle="name the interior weather lightly, then turn it into language"
              />
            ) : (
              entries.map((entry) => (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.logEntry}
                  onLongPress={() => handleDelete(entry.id)}
                  activeOpacity={0.9}
                  delayLongPress={600}
                >
                  {entry.condition_title && (
                    <Text style={styles.logConditionTitle}>{entry.condition_title}</Text>
                  )}
                  {entry.cadence && (
                    <View style={styles.logRow}>
                      <Text style={styles.logKey}>cadence</Text>
                      <Text style={styles.logValue}>{entry.cadence}</Text>
                    </View>
                  )}
                  {entry.exposure && (
                    <View style={styles.logRow}>
                      <Text style={styles.logKey}>exposure</Text>
                      <Text style={styles.logValue}>{entry.exposure}</Text>
                    </View>
                  )}
                  {entry.traction && (
                    <View style={styles.logRow}>
                      <Text style={styles.logKey}>traction</Text>
                      <Text style={styles.logValue}>{entry.traction}</Text>
                    </View>
                  )}
                  {entry.resonance && (
                    <View style={styles.logRow}>
                      <Text style={styles.logKey}>resonance</Text>
                      <Text style={styles.logValue}>{entry.resonance}</Text>
                    </View>
                  )}
                  <Text style={styles.logDate}>{formatDate(entry.created_at)}</Text>
                </TouchableOpacity>
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
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  fieldHeader: {
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    color: Colors.sand,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    marginBottom: 2,
  },
  fieldDescriptor: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 0.5,
  },
  fieldInput: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.lg,
    lineHeight: 28,
    paddingVertical: Spacing.sm,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  conditionSection: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  conditionInput: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    minWidth: 70,
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
  logSection: {
    padding: Spacing.lg,
  },
  logEntry: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  logConditionTitle: {
    color: Colors.sand,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    marginBottom: Spacing.sm,
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
    alignItems: 'flex-start',
  },
  logKey: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
    width: 80,
    paddingTop: 3,
  },
  logValue: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    flex: 1,
    lineHeight: 22,
  },
  logDate: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    marginTop: Spacing.sm,
  },
  bottomPad: {
    height: 48,
  },
});
