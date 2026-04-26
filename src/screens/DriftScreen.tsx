import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Colors, Fonts, FontSizes, Spacing, Radius,
  TIDE_STATES, TERRAIN_HINTS,
} from '../theme';
import {
  addLine, getLines, getRandomLine, Line,
} from '../db/database';
import { Header, SwellInput, WaveForecast } from '../components';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Drift'>;
};

type Sheet = 'tide' | 'terrain' | 'constellation' | null;

export default function DriftScreen({ navigation }: Props) {
  const [content, setContent] = useState('');
  const [tide, setTide] = useState<string | null>(null);
  const [terrain, setTerrain] = useState<string | null>(null);
  const [constellation, setConstellation] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [surfaced, setSurfaced] = useState<Line | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [recentTide, setRecentTide] = useState<string | null>(null);
  const [savedToday, setSavedToday] = useState(0);
  const surfacedOpacity = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    // Pull the most recent tide-tagged line so the inner forecast can lean
    // into the user's last-felt water state.
    const recent = await getLines();
    const lastTide = recent.find((l) => l.tide)?.tide ?? null;
    setRecentTide(lastTide);

    const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    setSavedToday(recent.filter((l) => l.created_at >= startOfDay).length);

    if (Math.random() < 0.4) {
      const r = await getRandomLine();
      setSurfaced(r);
      surfacedOpacity.setValue(0);
      Animated.timing(surfacedOpacity, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }).start();
    }
  }, [surfacedOpacity]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSave() {
    if (!content.trim()) return;
    await addLine({
      content: content.trim(),
      mode: 'fragment',
      tide,
      terrain,
      constellation,
    });
    setContent('');
    setTide(null);
    setTerrain(null);
    setConstellation(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  function shapeInVerso() {
    if (!content.trim()) return;
    navigation.navigate('Verso', { seedContent: content.trim() });
  }

  const remaining = 200 - content.length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="Swell"
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
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.captureArea}>
          <Text style={styles.driftLabel}>drift</Text>
          <SwellInput
            value={content}
            onChangeText={setContent}
            placeholder="catch a fragment…"
            multiline
            maxLength={200}
            style={styles.captureInput}
            containerStyle={styles.captureInputContainer}
            autoCorrect={false}
            autoFocus
          />

          {/* Optional context chips */}
          <View style={styles.chipRow}>
            <ContextChip
              label={tide ?? 'tide'}
              active={!!tide}
              onPress={() => setSheet(sheet === 'tide' ? null : 'tide')}
              onClear={tide ? () => setTide(null) : undefined}
            />
            <ContextChip
              label={terrain ?? 'terrain'}
              active={!!terrain}
              onPress={() => setSheet(sheet === 'terrain' ? null : 'terrain')}
              onClear={terrain ? () => setTerrain(null) : undefined}
            />
            <ContextChip
              label={constellation ? `with ${constellation}` : 'with'}
              active={!!constellation}
              onPress={() => setSheet(sheet === 'constellation' ? null : 'constellation')}
              onClear={constellation ? () => setConstellation(null) : undefined}
            />
          </View>

          {sheet === 'tide' && (
            <BottomSheet
              title="state of the water"
              options={TIDE_STATES}
              selected={tide}
              onSelect={(v) => { setTide(v); setSheet(null); }}
            />
          )}
          {sheet === 'terrain' && (
            <BottomSheet
              title="interior weather"
              options={TERRAIN_HINTS}
              selected={terrain}
              onSelect={(v) => { setTerrain(v); setSheet(null); }}
            />
          )}
          {sheet === 'constellation' && (
            <ConstellationSheet
              value={constellation}
              onConfirm={(name) => { setConstellation(name); setSheet(null); }}
            />
          )}

          <View style={styles.actionRow}>
            <Text style={styles.charCount}>
              {savedFlash ? 'kept ✓' : (content.length > 0 ? remaining : '')}
            </Text>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.shapeButton, !content.trim() && styles.disabled]}
                onPress={shapeInVerso}
                activeOpacity={0.8}
                disabled={!content.trim()}
              >
                <Text style={styles.shapeButtonText}>shape →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, !content.trim() && styles.disabled]}
                onPress={handleSave}
                activeOpacity={0.8}
                disabled={!content.trim()}
              >
                <Text style={styles.saveButtonText}>keep it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <WaveForecast recentTide={recentTide} savedToday={savedToday} />

        {surfaced && (
          <Animated.View style={[styles.surfaced, { opacity: surfacedOpacity }]}>
            <Text style={styles.surfacedLabel}>resurfaced</Text>
            <Text style={styles.surfacedContent}>{surfaced.content}</Text>
          </Animated.View>
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Lines')}
            activeOpacity={0.7}
          >
            <Text style={styles.footerLink}>depth stack</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Verso')}
            activeOpacity={0.7}
          >
            <Text style={styles.footerLink}>verso</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.7}
          >
            <Text style={styles.footerLink}>settings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ContextChip({
  label, active, onPress, onClear,
}: { label: string; active: boolean; onPress: () => void; onClear?: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {onClear && (
        <TouchableOpacity onPress={onClear} hitSlop={8} style={styles.chipClear}>
          <Text style={[styles.chipText, active && styles.chipTextActive]}>×</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function BottomSheet({
  title, options, selected, onSelect,
}: {
  title: string;
  options: readonly string[];
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  return (
    <View style={styles.sheet}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <View style={styles.sheetOptions}>
        {options.map((o) => (
          <TouchableOpacity
            key={o}
            onPress={() => onSelect(o)}
            style={[styles.sheetOption, selected === o && styles.sheetOptionActive]}
            activeOpacity={0.75}
          >
            <Text style={[styles.sheetOptionText, selected === o && styles.sheetOptionTextActive]}>
              {o}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ConstellationSheet({
  value, onConfirm,
}: { value: string | null; onConfirm: (v: string) => void }) {
  const [name, setName] = useState(value ?? '');
  return (
    <View style={styles.sheet}>
      <Text style={styles.sheetTitle}>who's in this</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="a name, a relation, a presence"
        placeholderTextColor={Colors.muted}
        style={styles.sheetInput}
        selectionColor={Colors.amber}
        autoFocus
        onSubmitEditing={() => name.trim() && onConfirm(name.trim())}
      />
      <TouchableOpacity
        style={[styles.sheetConfirm, !name.trim() && styles.disabled]}
        onPress={() => name.trim() && onConfirm(name.trim())}
        disabled={!name.trim()}
        activeOpacity={0.8}
      >
        <Text style={styles.sheetConfirmText}>tag</Text>
      </TouchableOpacity>
    </View>
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
  headerIcon: {
    color: Colors.sand,
    fontSize: FontSizes.xl,
    fontFamily: Fonts.sans,
  },
  driftLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  captureArea: {
    padding: Spacing.lg,
  },
  captureInputContainer: {
    borderColor: Colors.borderLight,
    paddingVertical: Spacing.md,
  },
  captureInput: {
    fontSize: FontSizes.xl,
    lineHeight: 32,
    minHeight: 100,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  chipActive: {
    backgroundColor: Colors.amber + '22',
    borderColor: Colors.amber,
  },
  chipText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  chipTextActive: {
    color: Colors.sandLight,
  },
  chipClear: {
    marginLeft: Spacing.xs,
  },
  sheet: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetTitle: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  sheetOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sheetOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sheetOptionActive: {
    borderColor: Colors.amber,
    backgroundColor: Colors.amber,
  },
  sheetOptionText: {
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
  },
  sheetOptionTextActive: {
    color: Colors.deepNavy,
    fontFamily: Fonts.serif,
  },
  sheetInput: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sheetConfirm: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xl,
  },
  sheetConfirmText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
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
  shapeButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shapeButtonText: {
    color: Colors.sand,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
  },
  saveButton: {
    backgroundColor: Colors.amber,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
  },
  saveButtonText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.4,
  },
  surfaced: {
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderLeftWidth: 2,
    borderLeftColor: Colors.amber,
  },
  surfacedLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  surfacedContent: {
    color: Colors.sandLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.xl,
    lineHeight: 32,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.xl,
  },
  footerLink: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  bottomPad: {
    height: 32,
  },
});
