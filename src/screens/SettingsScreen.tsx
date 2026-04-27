import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { confirm, notify } from '../confirm';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';
import {
  exportAllData,
  clearAllData,
  countSeedLines,
  deleteSeedLines,
} from '../db/database';
import { Header, Workbench } from '../components';
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
    const ok = await confirm({
      title: 'Drop the sample lines?',
      message: `${seedCount} sample line${seedCount === 1 ? '' : 's'} planted on first run will leave the archive. Anything you've kept stays.`,
      confirmLabel: 'Release samples',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    const removed = await deleteSeedLines();
    setSeedCount(0);
    notify('Released', `${removed} sample line${removed === 1 ? '' : 's'} dropped.`);
  }

  async function handleExport() {
    const data = await exportAllData();
    try {
      await Share.share({ message: data, title: 'Current Export' });
    } catch {}
  }

  async function handleClearData() {
    const ok = await confirm({
      title: 'Release every line?',
      message: 'This will let every saved line leave the archive — including anything you have kept. This cannot be undone.',
      confirmLabel: 'Release all',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!ok) return;
    await clearAllData();
    setSeedCount(0);
    notify('Released', 'The archive is empty.');
  }

  return (
    <View style={styles.container}>
      <Header title="Settings" onBack={() => navigation.goBack()} />

      <ScrollView showsVerticalScrollIndicator={false}>
        <Workbench size="normal">
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
              onPress={async () => {
                const ok = await confirm({
                  title: 'Sign out?',
                  message: 'You will need to sign in again to use Current.',
                  confirmLabel: 'Sign out',
                  cancelLabel: 'Stay',
                  destructive: true,
                });
                if (ok) auth.signOut();
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
            Drift catches the raw thing. Verso shapes it — paradox, aphorism,
            contradiction, or aside. Tide, terrain, and constellation are light
            tags you can add to any line.
          </Text>
          <Text style={styles.aboutText}>
            Generation runs server-side so your Anthropic key is never exposed
            to the client. Manual shaping (paradox, aphorism, contradiction,
            aside) is fully available offline against a small local fallback.
          </Text>
          <Text style={styles.version}>v1.2 — depth stack</Text>
        </View>

        <View style={styles.bottomPad} />
        </Workbench>
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
