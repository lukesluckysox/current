import React, { useCallback, useState } from 'react';
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
  exportAllData,
  clearAllData,
  countSeedLines,
  deleteSeedLines,
} from '../db/database';
import { Header } from '../components';
import { RootStackParamList } from '../../App';
import { useAuth } from '../AuthContext';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export default function SettingsScreen({ navigation }: Props) {
  const auth = useAuth();
  const [seedCount, setSeedCount] = useState<number>(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      countSeedLines().then((n) => {
        if (!cancelled) setSeedCount(n);
      }).catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [])
  );

  async function handleClearSeeds() {
    Alert.alert(
      'Drop the sample lines?',
      `${seedCount} sample line${seedCount === 1 ? '' : 's'} planted on first run will leave the archive. Anything you've kept stays.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Release samples',
          style: 'destructive',
          onPress: async () => {
            const removed = await deleteSeedLines();
            setSeedCount(0);
            Alert.alert('Released', `${removed} sample line${removed === 1 ? '' : 's'} dropped.`);
          },
        },
      ]
    );
  }

  async function handleExport() {
    const data = await exportAllData();
    try {
      await Share.share({ message: data, title: 'Current Export' });
    } catch {}
  }

  async function handleClearData() {
    Alert.alert(
      'Release every line?',
      'This will let every saved line leave the archive. This cannot be undone.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Release all',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Alert.alert('Released', 'The archive is empty.');
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Settings" onBack={() => navigation.goBack()} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>your lines</Text>
          <Text style={styles.sectionNote}>
            Everything lives on this device. No account, no cloud, no sync.
          </Text>

          <TouchableOpacity style={styles.actionRow} onPress={handleExport} activeOpacity={0.75}>
            <View>
              <Text style={styles.actionTitle}>Export all lines</Text>
              <Text style={styles.actionSubtitle}>plain text, with tags</Text>
            </View>
            <Text style={styles.actionArrow}>↑</Text>
          </TouchableOpacity>

          {seedCount > 0 && (
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleClearSeeds}
              activeOpacity={0.75}
              testID="drop-sample-lines"
            >
              <View>
                <Text style={styles.actionTitle}>Drop the sample lines</Text>
                <Text style={styles.actionSubtitle}>
                  {seedCount} planted on first run · your kept lines stay
                </Text>
              </View>
              <Text style={styles.actionArrow}>×</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.actionRow} onPress={handleClearData} activeOpacity={0.75}>
            <View>
              <Text style={[styles.actionTitle, styles.destructive]}>Release every line</Text>
              <Text style={styles.actionSubtitle}>they will leave the archive</Text>
            </View>
            <Text style={[styles.actionArrow, styles.destructive]}>↻</Text>
          </TouchableOpacity>
        </View>

        {auth.status === 'authenticated' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>account</Text>
            <Text style={styles.sectionNote}>
              signed in as {auth.user.username}.
            </Text>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => {
                Alert.alert('Sign out?', 'You will need to sign in again to use Current.', [
                  { text: 'Stay', style: 'cancel' },
                  {
                    text: 'Sign out',
                    style: 'destructive',
                    onPress: () => {
                      auth.signOut();
                    },
                  },
                ]);
              }}
              activeOpacity={0.75}
            >
              <View>
                <Text style={styles.actionTitle}>Sign out</Text>
                <Text style={styles.actionSubtitle}>your saved lines stay on this device</Text>
              </View>
              <Text style={styles.actionArrow}>→</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>about current</Text>
          <Text style={styles.aboutText}>
            Current is a pocket creative instrument for catching a fragment, shaping
            a line, and keeping the ones worth keeping.
          </Text>
          <Text style={styles.aboutText}>
            Drift catches the raw thing. Verso shapes it — completing,
            distilling, inverting, or turning it into a paradox. Tide, terrain,
            and constellation are light tags you can add to any line.
          </Text>
          <Text style={styles.aboutText}>
            On-device AI generation has been removed in this version: it
            previously required exposing an API key client-side, which is not
            safe. Manual shaping (paradox, distill, aphorism, invert) is fully
            available.
          </Text>
          <Text style={styles.version}>v1.2 — depth stack</Text>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.deepNavy,
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
    marginBottom: Spacing.sm,
  },
  sectionNote: {
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  actionTitle: {
    color: Colors.saltWhite,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    marginBottom: 2,
  },
  actionSubtitle: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
  },
  actionArrow: {
    color: Colors.muted,
    fontSize: FontSizes.xl,
    fontFamily: Fonts.sans,
  },
  destructive: {
    color: Colors.error,
  },
  aboutText: {
    color: Colors.mutedLight,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    lineHeight: 26,
    marginBottom: Spacing.md,
  },
  version: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1,
    marginTop: Spacing.sm,
  },
  bottomPad: {
    height: 48,
  },
});
