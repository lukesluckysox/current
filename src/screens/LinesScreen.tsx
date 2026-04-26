import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';
import {
  getLines, deleteLine, toggleLineFavorite, Line, LineMode,
} from '../db/database';
import { Header, EmptyState, Pill } from '../components';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Lines'>;
};

const FILTERS: Array<{ id: 'all' | LineMode; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'fragment', label: 'fragments' },
  { id: 'complete', label: 'completed' },
  { id: 'paradox', label: 'paradox' },
  { id: 'aphorism', label: 'aphorism' },
  { id: 'distill', label: 'distilled' },
  { id: 'invert', label: 'inverted' },
];

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function LinesScreen({ navigation }: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [filter, setFilter] = useState<'all' | LineMode>('all');

  const load = useCallback(async () => {
    const data = await getLines(filter === 'all' ? undefined : { mode: filter });
    setLines(data);
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleDelete(id: number) {
    Alert.alert('Remove this line?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteLine(id);
          await load();
        },
      },
    ]);
  }

  async function handleToggleFavorite(line: Line) {
    await toggleLineFavorite(line.id, line.is_favorite === 0);
    await load();
  }

  async function handleShare(line: Line) {
    try {
      await Share.share({ message: line.content });
    } catch {}
  }

  return (
    <View style={styles.container}>
      <Header
        title="Lines"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {FILTERS.map((f) => (
            <Pill
              key={f.id}
              label={f.label}
              active={filter === f.id}
              onPress={() => setFilter(f.id)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {lines.length === 0 ? (
          <EmptyState
            title="no lines yet"
            subtitle="catch a fragment, shape it, keep it"
          />
        ) : (
          lines.map((line) => (
            <TouchableOpacity
              key={line.id}
              style={styles.entry}
              onLongPress={() => handleDelete(line.id)}
              activeOpacity={0.9}
              delayLongPress={600}
            >
              <Text style={styles.entryContent}>{line.content}</Text>

              {line.template && (
                <Text style={styles.entryTemplate}>{line.template}</Text>
              )}

              <View style={styles.tagRow}>
                <Text style={styles.entryMode}>{line.mode}</Text>
                {line.tide && <Tag label={line.tide} kind="tide" />}
                {line.terrain && <Tag label={line.terrain} kind="terrain" />}
                {line.constellation && <Tag label={`with ${line.constellation}`} kind="con" />}
                {line.topic && <Tag label={line.topic} kind="topic" />}
              </View>

              <View style={styles.entryFooter}>
                <Text style={styles.entryDate}>{formatDate(line.created_at)}</Text>
                <View style={styles.entryActions}>
                  <TouchableOpacity
                    onPress={() => handleToggleFavorite(line)}
                    style={styles.actionButton}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.actionIcon, line.is_favorite === 1 && styles.favoriteActive]}>
                      ★
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleShare(line)}
                    style={styles.actionButton}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionIcon}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(line.id)}
                    style={styles.actionButton}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionIcon}>×</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

function Tag({ label, kind }: { label: string; kind: 'tide' | 'terrain' | 'con' | 'topic' }) {
  return (
    <View style={[styles.tag, styles[`tag_${kind}`]]}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
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
  entry: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  entryContent: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    lineHeight: 32,
    marginBottom: Spacing.xs,
  },
  entryTemplate: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginBottom: Spacing.sm,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  entryMode: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginRight: Spacing.sm,
  },
  tag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tag_tide: {
    borderColor: Colors.borderLight,
  },
  tag_terrain: {
    borderColor: Colors.borderLight,
  },
  tag_con: {
    borderColor: Colors.borderLight,
  },
  tag_topic: {
    borderColor: Colors.amber,
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
  entryActions: {
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
