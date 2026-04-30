import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';
import { Header, SwellInput, Workbench, useIsDesktop } from '../components';
import { addLine, getLines, Line } from '../db/database';
import { generateAnchor, AnchorPull } from '../llm';
import { RootStackParamList } from '../../App';

// ─── Stillwater ──────────────────────────────────────────────────────────────
//
// A grounding surface for a moment of pull. The speaker selects one of three
// pull states — being pulled under, holding the line, kicking against the
// current — and either taps for a quiet local anchor or types what is pulling
// at them and asks for an LLM-shaped one. Saved anchors land in `lines` with
// mode='anchor' so they flow through Lines/LineDetail like any other line.
//
// The screen reuses Current's existing Header, SwellInput, Workbench, and the
// /api/anchor route on the server. No new colors, no new theme primitives.

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Stillwater'>;
};

type Pull = AnchorPull; // 'under' | 'holding' | 'against'

// Local anchor bank used on first load and as an offline fallback. Each line
// is tagged with the pull state(s) it speaks to so the random pick stays
// honest to the selector. '*' means it works for any pull.
type LocalAnchor = { text: string; pulls: Array<Pull | '*'> };

const LOCAL_ANCHORS: LocalAnchor[] = [
  // Holding — the settled middle.
  { text: 'You opted out without leaving. That takes more than either extreme.', pulls: ['holding'] },
  { text: 'Staying porous to real things, closed to the manufactured ones.', pulls: ['holding'] },
  { text: 'The freest person in the room is usually the quietest one.', pulls: ['holding'] },
  { text: 'Curiosity without urgency. Presence without need.', pulls: ['holding'] },
  { text: 'Sovereignty isn’t loud. It’s settled.', pulls: ['holding', '*'] },

  // Under — absorbing the room.
  { text: 'You were someone before you walked in. Remember the shape of that.', pulls: ['under'] },
  { text: 'Whose voice is that, in your head right now. Probably not yours.', pulls: ['under'] },
  { text: 'Titles dissolve at lunch.', pulls: ['under'] },
  { text: 'Approval is rented. The cost compounds.', pulls: ['under'] },
  { text: 'The version of you they want is smaller than you are.', pulls: ['under'] },
  { text: 'You can disappoint someone and still be intact.', pulls: ['under'] },
  { text: 'Performing fluency is not the same as being fluent.', pulls: ['under'] },

  // Against — still feeding what you fight.
  { text: 'Refusal still belongs to the conversation. Try silence.', pulls: ['against'] },
  { text: 'Most of the walls are wallpaper. Don’t kick wallpaper.', pulls: ['against'] },
  { text: 'If you have to win, you’re already playing their game.', pulls: ['against'] },
  { text: 'Contempt is just another kind of attention. Spend it carefully.', pulls: ['against'] },
  { text: 'Let them be wrong without you. That’s the practice.', pulls: ['against'] },
  { text: 'Anger sharpens, but it also tethers. Notice what you’re tied to.', pulls: ['against'] },

  // Universal.
  { text: 'Notice the pull. Don’t argue with it. Just notice.', pulls: ['*'] },
  { text: 'Slow is a stance.', pulls: ['*'] },
  { text: 'You don’t owe a response to every signal.', pulls: ['*'] },
  { text: 'The body knows before the mind admits it.', pulls: ['*'] },
];

const RECENT_WINDOW = 6;

function pickLocal(pull: Pull, exclude: string[]): string {
  const matches = LOCAL_ANCHORS.filter(
    (a) => (a.pulls.includes(pull) || a.pulls.includes('*')) && !exclude.includes(a.text)
  );
  const pool = matches.length > 0 ? matches : LOCAL_ANCHORS;
  return pool[Math.floor(Math.random() * pool.length)].text;
}

const PULLS: Array<{ id: Pull; label: string; sub: string }> = [
  { id: 'under',    label: 'pulled under',         sub: 'absorbing the room' },
  { id: 'holding',  label: 'holding the line',     sub: 'porous to real, closed to manufactured' },
  { id: 'against',  label: 'against the current',  sub: 'still inside the argument' },
];

export default function StillwaterScreen({ navigation }: Props) {
  const [pull, setPull] = useState<Pull>('holding');
  const [anchor, setAnchor] = useState<string>(() => pickLocal('holding', []));
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [recentAnchors, setRecentAnchors] = useState<Line[]>([]);
  const recentRef = useRef<string[]>([]);
  const opacity = useRef(new Animated.Value(1)).current;

  // Load saved anchors so the bottom strip can show what the user has kept.
  const loadHistory = useCallback(async () => {
    const all = await getLines({ mode: 'anchor' });
    setRecentAnchors(all.slice(0, 6));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  function fadeTo(text: string) {
    Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      setAnchor(text);
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    });
    recentRef.current = [text, ...recentRef.current].slice(0, RECENT_WINDOW);
  }

  function changePull(next: Pull) {
    if (next === pull) return;
    setPull(next);
    fadeTo(pickLocal(next, recentRef.current));
  }

  function newLocal() {
    fadeTo(pickLocal(pull, recentRef.current));
  }

  async function fetchAI() {
    if (!custom.trim() || busy) return;
    setBusy(true);
    try {
      const res = await generateAnchor(pull, custom.trim());
      if (res.ok) {
        fadeTo(res.line);
      } else {
        // Fall back to local rather than surfacing a network error.
        fadeTo(pickLocal(pull, recentRef.current));
      }
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    if (!anchor.trim() || savedFlash) return;
    await addLine({
      content: anchor,
      mode: 'anchor',
      // Stash the pull state in `topic` so it survives roundtrips through
      // Lines/LineDetail without needing a schema change.
      topic: pull,
      // If the speaker named what was pulling at them, keep that next to the
      // line as light context. Truncated to keep the row tidy.
      constellation: custom.trim() ? custom.trim().slice(0, 80) : null,
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
    setCustom('');
    await loadHistory();
  }

  const isDesktop = useIsDesktop();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="stillwater"
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Workbench size="narrow">
          <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
            <Text style={styles.eyebrow}>where the pull is</Text>
            <View style={styles.pullRow}>
              {PULLS.map((p) => {
                const active = p.id === pull;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => changePull(p.id)}
                    activeOpacity={0.8}
                    style={[styles.pullChip, active && styles.pullChipActive]}
                  >
                    <Text style={[styles.pullLabel, active && styles.pullLabelActive]}>
                      {p.label}
                    </Text>
                    <Text style={[styles.pullSub, active && styles.pullSubActive]}>
                      {p.sub}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.anchorWrap}>
              <Animated.Text style={[styles.anchorText, { opacity }]}>
                {anchor}
              </Animated.Text>
            </View>

            <TouchableOpacity
              onPress={newLocal}
              activeOpacity={0.7}
              style={styles.dotWrap}
              accessibilityLabel="another anchor"
            >
              <View style={styles.dot} />
            </TouchableOpacity>

            <Text style={styles.eyebrow}>something specific on your mind</Text>
            <SwellInput
              value={custom}
              onChangeText={setCustom}
              placeholder="what’s pulling at you right now…"
              multiline
              maxLength={280}
              style={styles.customInput}
              containerStyle={styles.customInputContainer}
              autoCorrect={false}
            />

            <View style={styles.actionRow}>
              <Text style={styles.charCount}>
                {savedFlash ? 'kept ✓' : (custom.length > 0 ? 280 - custom.length : '')}
              </Text>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  onPress={fetchAI}
                  disabled={!custom.trim() || busy}
                  activeOpacity={0.8}
                  style={[
                    styles.groundButton,
                    (!custom.trim() || busy) && styles.disabled,
                  ]}
                >
                  <Text style={styles.groundButtonText}>
                    {busy ? '…' : 'ground me'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={keep}
                  disabled={!anchor.trim() || savedFlash}
                  activeOpacity={0.8}
                  style={[
                    styles.keepButton,
                    (!anchor.trim() || savedFlash) && styles.disabled,
                  ]}
                >
                  <Text style={styles.keepButtonText}>keep it</Text>
                </TouchableOpacity>
              </View>
            </View>

            {recentAnchors.length > 0 && (
              <View style={styles.history}>
                <Text style={styles.eyebrow}>kept anchors</Text>
                {recentAnchors.map((l) => (
                  <TouchableOpacity
                    key={l.id}
                    onPress={() => navigation.navigate('LineDetail', { lineId: l.id })}
                    activeOpacity={0.7}
                    style={styles.historyItem}
                  >
                    <Text style={styles.historyText}>{l.content}</Text>
                    {l.topic && (
                      <Text style={styles.historyMeta}>{labelFor(l.topic as Pull)}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.bottomPad} />
          </View>
        </Workbench>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function labelFor(pull: Pull): string {
  return PULLS.find((p) => p.id === pull)?.label ?? '';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.deepNavy },
  scroll: { flex: 1 },
  body: { padding: Spacing.lg },
  bodyDesktop: { paddingTop: Spacing.xl },
  eyebrow: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  pullRow: {
    flexDirection: 'column',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  pullChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  pullChipActive: {
    borderColor: Colors.amber,
    backgroundColor: Colors.amber + '18',
  },
  pullLabel: {
    color: Colors.sand,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    letterSpacing: 1,
  },
  pullLabelActive: {
    color: Colors.amberLight,
  },
  pullSub: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  pullSubActive: {
    color: Colors.sandLight,
  },
  anchorWrap: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  anchorText: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xl,
    lineHeight: 34,
    textAlign: 'center',
  },
  dotWrap: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.amber,
    opacity: 0.6,
  },
  customInputContainer: {
    borderColor: Colors.borderLight,
    paddingVertical: Spacing.sm,
  },
  customInput: {
    fontSize: FontSizes.md,
    lineHeight: 24,
    minHeight: 80,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  charCount: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  groundButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groundButtonText: {
    color: Colors.sand,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  keepButton: {
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
  },
  keepButtonText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  disabled: { opacity: 0.4 },
  history: {
    marginTop: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  historyItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyText: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    lineHeight: 22,
  },
  historyMeta: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  bottomPad: { height: 64 },
});
