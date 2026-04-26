import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  StatusBar,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing } from '../theme';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Selector'>;
};

type Instrument = {
  id: keyof RootStackParamList;
  name: string;
  descriptor: string;
  glyph: string;
};

const READ_INSTRUMENTS: Instrument[] = [
  {
    id: 'Terrain',
    name: 'Terrain',
    descriptor: 'name the present interior weather',
    glyph: '◎',
  },
  {
    id: 'Constellation',
    name: 'Constellation',
    descriptor: 'map the social field lightly',
    glyph: '⊙',
  },
];

const WRITE_INSTRUMENTS: Instrument[] = [
  {
    id: 'Drift',
    name: 'Drift',
    descriptor: 'catch a fragment in under fifteen seconds',
    glyph: '〜',
  },
  {
    id: 'Tide',
    name: 'Tide',
    descriptor: 'name the weather of the mind as ocean state',
    glyph: '≋',
  },
  {
    id: 'Verso',
    name: 'Verso',
    descriptor: 'complete a line through a template',
    glyph: '—',
  },
  {
    id: 'Paradox',
    name: 'Paradox',
    descriptor: 'write or generate a compact contradiction',
    glyph: '∞',
  },
];

const ALL_INSTRUMENTS = [...READ_INSTRUMENTS, ...WRITE_INSTRUMENTS];

export default function InstrumentSelector({ navigation }: Props) {
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(12)).current;
  const cardOpacities = useRef(ALL_INSTRUMENTS.map(() => new Animated.Value(0))).current;
  const cardTranslates = useRef(ALL_INSTRUMENTS.map(() => new Animated.Value(16))).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(titleTranslate, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
      Animated.stagger(
        100,
        ALL_INSTRUMENTS.map((_, i) =>
          Animated.parallel([
            Animated.timing(cardOpacities[i], { toValue: 1, duration: 450, useNativeDriver: true }),
            Animated.timing(cardTranslates[i], { toValue: 0, duration: 450, useNativeDriver: true }),
          ])
        )
      ),
    ]).start();
  }, []);

  function renderInstrument(instrument: Instrument, index: number) {
    return (
      <Animated.View
        key={instrument.id}
        style={{
          opacity: cardOpacities[index],
          transform: [{ translateY: cardTranslates[index] }],
        }}
      >
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.instrumentCard}
          onPress={() => navigation.navigate(instrument.id as any)}
        >
          <Text style={styles.glyph}>{instrument.glyph}</Text>
          <View style={styles.instrumentText}>
            <Text style={styles.instrumentName}>{instrument.name}</Text>
            <Text style={styles.instrumentDescriptor}>{instrument.descriptor}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Animated.View
        style={[
          styles.titleArea,
          { opacity: titleOpacity, transform: [{ translateY: titleTranslate }] },
        ]}
      >
        <Text style={styles.appName}>Swell</Text>
        <Text style={styles.appTagline}>
          passing states become lines worth keeping
        </Text>
      </Animated.View>

      <ScrollView
        contentContainerStyle={styles.instruments}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.groupSection}>
          <Text style={styles.groupLabel}>read</Text>
          {READ_INSTRUMENTS.map((inst, i) => renderInstrument(inst, i))}
        </View>

        <View style={styles.groupDivider} />

        <View style={styles.groupSection}>
          <Text style={styles.groupLabel}>write</Text>
          {WRITE_INSTRUMENTS.map((inst, i) => renderInstrument(inst, READ_INSTRUMENTS.length + i))}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Settings')}
        activeOpacity={0.7}
      >
        <Text style={styles.settingsText}>settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.deepNavy,
  },
  titleArea: {
    paddingTop: 80,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  appName: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xxxl,
    letterSpacing: -1,
    marginBottom: Spacing.xs,
  },
  appTagline: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    lineHeight: 24,
  },
  instruments: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  groupSection: {
    paddingBottom: Spacing.sm,
  },
  groupLabel: {
    color: Colors.amber,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  groupDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },
  instrumentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  glyph: {
    color: Colors.sand,
    fontSize: FontSizes.xl,
    fontFamily: Fonts.serif,
    width: 36,
  },
  instrumentText: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  instrumentName: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    marginBottom: 2,
  },
  instrumentDescriptor: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  arrow: {
    color: Colors.muted,
    fontSize: FontSizes.xl,
    fontFamily: Fonts.sans,
  },
  settingsButton: {
    alignItems: 'center',
    paddingBottom: 48,
    paddingTop: Spacing.md,
  },
  settingsText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    letterSpacing: 1,
  },
});
