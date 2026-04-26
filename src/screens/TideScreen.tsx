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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius, TIDE_STATES, TIDE_COLORS } from '../theme';
import { getTideEntries, addTideEntry, deleteTideEntry, TideEntry } from '../db/database';
import { Header, EmptyState } from '../components';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Tide'>;
};

function formatDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function TideScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [customState, setCustomState] = useState('');
  const [note, setNote] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [entries, setEntries] = useState<TideEntry[]>([]);
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const feedbackScale = useRef(new Animated.Value(0.9)).current;

  const load = useCallback(async () => {
    const data = await getTideEntries();
    setEntries(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function showFeedback() {
    feedbackOpacity.setValue(0);
    feedbackScale.setValue(0.9);
    Animated.parallel([
      Animated.timing(feedbackOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(feedbackScale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(feedbackOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
      }, 1000);
    });
  }

  async function handleSave() {
    const state = showCustom ? customState.trim() : selected;
    if (!state) return;
    await addTideEntry(state, note.trim() || null);
    setSelected(null);
    setCustomState('');
    setNote('');
    setShowCustom(false);
    showFeedback();
    await load();
  }

  async function handleDelete(id: number) {
    Alert.alert('Remove tide entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteTideEntry(id);
          await load();
        },
      },
    ]);
  }

  const activeState = showCustom ? customState.trim() : selected;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Tide" onBack={() => navigation.goBack()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* State selector */}
        <View style={styles.selectorSection}>
          <Text style={styles.sectionLabel}>current conditions</Text>

          <View style={styles.stateGrid}>
            {TIDE_STATES.map((state) => {
              const isActive = selected === state && !showCustom;
              const color = TIDE_COLORS[state] ?? Colors.muted;
              return (
                <TouchableOpacity
                  key={state}
                  style={[styles.stateChip, isActive && { borderColor: color, backgroundColor: color + '22' }]}
                  onPress={() => {
                    setSelected(state);
                    setShowCustom(false);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.stateChipDot, { backgroundColor: color }]} />
                  <Text style={[styles.stateChipText, isActive && { color: Colors.saltWhite }]}>
                    {state}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.stateChip, showCustom && styles.stateChipActive]}
              onPress={() => { setShowCustom(true); setSelected(null); }}
              activeOpacity={0.75}
            >
              <Text style={[styles.stateChipText, showCustom && { color: Colors.saltWhite }]}>
                + name it yourself
              </Text>
            </TouchableOpacity>
          </View>

          {showCustom && (
            <TextInput
              value={customState}
              onChangeText={setCustomState}
              placeholder="describe the current state…"
              placeholderTextColor={Colors.muted}
              style={styles.customInput}
              selectionColor={Colors.amber}
              autoFocus
            />
          )}

          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, 100))}
            placeholder="why this tide? (optional)"
            placeholderTextColor={Colors.muted}
            style={styles.noteInput}
            selectionColor={Colors.amber}
          />

          <View style={styles.saveRow}>
            <Text style={styles.noteCount}>{note.length > 0 ? `${100 - note.length}` : ''}</Text>
            <TouchableOpacity
              style={[styles.saveButton, !activeState && styles.saveButtonDisabled]}
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={!activeState}
            >
              <Text style={styles.saveButtonText}>mark tide</Text>
            </TouchableOpacity>
          </View>

          <Animated.View
            style={[
              styles.feedback,
              { opacity: feedbackOpacity, transform: [{ scale: feedbackScale }] },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.feedbackText}>marked</Text>
          </Animated.View>
        </View>

        {/* Timeline */}
        <View style={styles.timeline}>
          <Text style={styles.sectionLabel}>the log</Text>
          {entries.length === 0 ? (
            <EmptyState
              title="no tides recorded"
              subtitle="name the weather of the mind"
            />
          ) : (
            entries.map((entry, index) => {
              const color = TIDE_COLORS[entry.state] ?? Colors.muted;
              return (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.tideEntry}
                  onLongPress={() => handleDelete(entry.id)}
                  activeOpacity={0.9}
                  delayLongPress={600}
                >
                  <View style={[styles.tideBar, { backgroundColor: color }]} />
                  <View style={styles.tideContent}>
                    <Text style={[styles.tideState, { color: color }]}>{entry.state}</Text>
                    {entry.note ? (
                      <Text style={styles.tideNote}>{entry.note}</Text>
                    ) : null}
                    <Text style={styles.tideDate}>{formatDateTime(entry.created_at)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

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
  selectorSection: {
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
  stateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  stateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stateChipActive: {
    borderColor: Colors.borderLight,
  },
  stateChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs,
    opacity: 0.8,
  },
  stateChipText: {
    color: Colors.mutedLight,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  customInput: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  noteInput: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteCount: {
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
  feedback: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  feedbackText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  timeline: {
    padding: Spacing.lg,
  },
  tideEntry: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  tideBar: {
    width: 3,
    borderRadius: 2,
    marginRight: Spacing.md,
    opacity: 0.8,
  },
  tideContent: {
    flex: 1,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tideState: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    marginBottom: 2,
  },
  tideNote: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    marginBottom: 4,
  },
  tideDate: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
  },
  bottomPad: {
    height: 48,
  },
});
