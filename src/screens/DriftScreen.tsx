import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius, DRIFT_TAGS, DriftTag } from '../theme';
import {
  getDriftEntries,
  addDriftEntry,
  deleteDriftEntry,
  getRandomDriftEntry,
  DriftEntry,
} from '../db/database';
import { Header, SwellInput, EmptyState, Pill } from '../components';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Drift'>;
};

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DriftScreen({ navigation }: Props) {
  const [content, setContent] = useState('');
  const [tag, setTag] = useState<DriftTag>('thought');
  const [entries, setEntries] = useState<DriftEntry[]>([]);
  const [surfaced, setSurfaced] = useState<DriftEntry | null>(null);
  const surfacedOpacity = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    const data = await getDriftEntries();
    setEntries(data);
    if (data.length > 1 && Math.random() < 0.4) {
      const r = await getRandomDriftEntry();
      setSurfaced(r);
      Animated.timing(surfacedOpacity, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }).start();
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSave() {
    if (!content.trim()) return;
    await addDriftEntry(content.trim(), tag);
    setContent('');
    await load();
  }

  async function handleDelete(id: number) {
    Alert.alert('Remove fragment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteDriftEntry(id);
          await load();
        },
      },
    ]);
  }

  const remaining = 200 - content.length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Drift" onBack={() => navigation.goBack()} />

      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Capture area */}
        <View style={styles.captureArea}>
          <SwellInput
            value={content}
            onChangeText={setContent}
            placeholder="catch a fragment…"
            multiline
            maxLength={200}
            style={styles.captureInput}
            containerStyle={styles.captureInputContainer}
            autoCorrect={false}
          />
          <View style={styles.captureFooter}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow}>
              {DRIFT_TAGS.map((t) => (
                <Pill key={t} label={t} active={tag === t} onPress={() => setTag(t)} />
              ))}
            </ScrollView>
            <View style={styles.saveRow}>
              <Text style={styles.charCount}>{remaining}</Text>
              <TouchableOpacity
                style={[styles.saveButton, !content.trim() && styles.saveButtonDisabled]}
                onPress={handleSave}
                activeOpacity={0.8}
                disabled={!content.trim()}
              >
                <Text style={styles.saveButtonText}>keep it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Resurfaced */}
        {surfaced && (
          <Animated.View style={[styles.surfaced, { opacity: surfacedOpacity }]}>
            <Text style={styles.surfacedContent}>{surfaced.content}</Text>
          </Animated.View>
        )}

        {/* Collection */}
        <View style={styles.collection}>
          {entries.length === 0 ? (
            <EmptyState
              title="nothing caught yet"
              subtitle="fragments arrive when you're not looking for them"
            />
          ) : (
            entries.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={styles.entry}
                onLongPress={() => handleDelete(entry.id)}
                activeOpacity={0.9}
                delayLongPress={600}
              >
                <Text style={styles.entryContent}>{entry.content}</Text>
                <View style={styles.entryMeta}>
                  <Text style={styles.entryTag}>{entry.tag}</Text>
                  <Text style={styles.entryDate}>{formatDate(entry.created_at)}</Text>
                </View>
              </TouchableOpacity>
            ))
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
  scroll: {
    flex: 1,
  },
  captureArea: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  captureInputContainer: {
    borderColor: Colors.borderLight,
    paddingVertical: Spacing.md,
  },
  captureInput: {
    fontSize: FontSizes.xl,
    lineHeight: 32,
    minHeight: 80,
  },
  captureFooter: {
    marginTop: Spacing.md,
  },
  tagRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  surfaced: {
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
  },
  surfacedContent: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xl,
    lineHeight: 32,
  },
  collection: {
    paddingHorizontal: Spacing.lg,
  },
  entry: {
    paddingVertical: Spacing.md,
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
  entryMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryTag: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  entryDate: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
  },
  bottomPad: {
    height: 48,
  },
});
