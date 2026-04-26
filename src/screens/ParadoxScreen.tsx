import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Anthropic from '@anthropic-ai/sdk';
import { Colors, Fonts, FontSizes, Spacing, Radius, PARADOX_TOPICS } from '../theme';
import {
  getParadoxEntries,
  addParadoxEntry,
  deleteParadoxEntry,
  getConfig,
  ParadoxEntry,
} from '../db/database';
import { Header, EmptyState, Pill } from '../components';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Paradox'>;
};

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ParadoxScreen({ navigation }: Props) {
  const [mode, setMode] = useState<'write' | 'generate'>('write');
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [customTopic, setCustomTopic] = useState('');
  const [entries, setEntries] = useState<ParadoxEntry[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [view, setView] = useState<'compose' | 'anthology'>('compose');

  const load = useCallback(async () => {
    const data = await getParadoxEntries();
    setEntries(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleGenerate() {
    const t = customTopic.trim() || topic;
    if (!t) return;
    const apiKey = await getConfig('anthropic_api_key');
    if (!apiKey) {
      Alert.alert(
        'API key required',
        'Add your Anthropic API key in Settings to use paradox generation.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Settings', onPress: () => navigation.navigate('Settings') },
        ]
      );
      return;
    }

    setGenerating(true);
    setGenerated(null);
    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system:
          'You generate philosophical paradoxes. Return a single paradox of two to four lines maximum. No explanation, no preamble, no title. Just the paradox itself. It should be clever, precise, and earn its contradiction.',
        messages: [{ role: 'user', content: `Write a paradox about ${t}.` }],
      });
      const text =
        response.content[0]?.type === 'text' ? response.content[0].text.trim() : null;
      setGenerated(text);
    } catch (err: any) {
      Alert.alert('Generation failed', err?.message ?? 'Something went wrong.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveWrite() {
    if (!content.trim()) return;
    await addParadoxEntry(content.trim());
    setContent('');
    setView('anthology');
    await load();
  }

  async function handleSaveGenerated() {
    if (!generated) return;
    const t = customTopic.trim() || (topic ?? undefined);
    await addParadoxEntry(generated, t);
    setGenerated(null);
    setTopic(null);
    setCustomTopic('');
    setView('anthology');
    await load();
  }

  async function handleDelete(id: number) {
    Alert.alert('Remove this paradox?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteParadoxEntry(id);
          await load();
        },
      },
    ]);
  }

  const remaining = 280 - content.length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Paradox"
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            onPress={() => setView(view === 'compose' ? 'anthology' : 'compose')}
            activeOpacity={0.7}
          >
            <Text style={styles.viewToggle}>{view === 'compose' ? '≡' : '∞'}</Text>
          </TouchableOpacity>
        }
      />

      {view === 'compose' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Mode toggle */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'write' && styles.modeTabActive]}
              onPress={() => setMode('write')}
              activeOpacity={0.75}
            >
              <Text style={[styles.modeTabText, mode === 'write' && styles.modeTabTextActive]}>
                write
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, mode === 'generate' && styles.modeTabActive]}
              onPress={() => setMode('generate')}
              activeOpacity={0.75}
            >
              <Text style={[styles.modeTabText, mode === 'generate' && styles.modeTabTextActive]}>
                generate
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'write' ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>write a paradox</Text>
              <TextInput
                value={content}
                onChangeText={(t) => setContent(t.slice(0, 280))}
                placeholder="a truth that undoes itself…"
                placeholderTextColor={Colors.muted}
                style={styles.writeInput}
                multiline
                selectionColor={Colors.amber}
                autoCorrect={false}
              />
              <View style={styles.saveRow}>
                <Text style={styles.charCount}>{remaining < 280 ? remaining : ''}</Text>
                <TouchableOpacity
                  style={[styles.saveButton, !content.trim() && styles.saveButtonDisabled]}
                  onPress={handleSaveWrite}
                  activeOpacity={0.8}
                  disabled={!content.trim()}
                >
                  <Text style={styles.saveButtonText}>keep it</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>choose a topic</Text>
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

              <TouchableOpacity
                style={[
                  styles.generateButton,
                  (!topic && !customTopic.trim()) && styles.saveButtonDisabled,
                ]}
                onPress={handleGenerate}
                activeOpacity={0.8}
                disabled={generating || (!topic && !customTopic.trim())}
              >
                {generating ? (
                  <ActivityIndicator color={Colors.deepNavy} />
                ) : (
                  <Text style={styles.generateButtonText}>generate paradox</Text>
                )}
              </TouchableOpacity>

              {generated && (
                <View style={styles.generatedResult}>
                  <Text style={styles.generatedText}>{generated}</Text>
                  <TouchableOpacity
                    style={styles.saveGeneratedButton}
                    onPress={handleSaveGenerated}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveButtonText}>save to anthology</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <View style={styles.bottomPad} />
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            {entries.length === 0 ? (
              <EmptyState
                title="no paradoxes yet"
                subtitle="write one, or generate from a topic"
              />
            ) : (
              entries.map((entry) => (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.paradoxEntry}
                  onLongPress={() => handleDelete(entry.id)}
                  activeOpacity={0.9}
                  delayLongPress={600}
                >
                  <Text style={styles.paradoxContent}>{entry.content}</Text>
                  <View style={styles.paradoxMeta}>
                    {entry.prompt && (
                      <Text style={styles.paradoxPrompt}>{entry.prompt}</Text>
                    )}
                    <Text style={styles.paradoxDate}>{formatDate(entry.created_at)}</Text>
                  </View>
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
  modeRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modeTab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
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
  generateButton: {
    backgroundColor: Colors.amber,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  generateButtonText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  generatedResult: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    backgroundColor: Colors.card,
  },
  generatedText: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    lineHeight: 34,
    marginBottom: Spacing.lg,
  },
  saveGeneratedButton: {
    backgroundColor: Colors.amber,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    alignItems: 'center',
  },
  paradoxEntry: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  paradoxContent: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    lineHeight: 34,
    marginBottom: Spacing.sm,
  },
  paradoxMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paradoxPrompt: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  paradoxDate: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
  },
  bottomPad: {
    height: 48,
  },
});
