import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Share,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';
import { getConfig, setConfig, exportAllData, clearAllData } from '../db/database';
import { Header } from '../components';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export default function SettingsScreen({ navigation }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const key = await getConfig('anthropic_api_key');
    if (key) setApiKey(key);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSaveApiKey() {
    await setConfig('anthropic_api_key', apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleExport() {
    const data = await exportAllData();
    try {
      await Share.share({ message: data, title: 'Swell Export' });
    } catch {}
  }

  async function handleClearData() {
    Alert.alert(
      'Clear all data?',
      'This will permanently remove all entries across Drift, Tide, Verso, Paradox, Terrain, and Constellation. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear everything',
          style: 'destructive',
          onPress: async () => {
            await clearAllData();
            Alert.alert('Done', 'All data has been cleared.');
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Settings" onBack={() => navigation.goBack()} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* API key */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>paradox generation</Text>
          <Text style={styles.sectionNote}>
            Paradox generation uses the Anthropic API. Add your key here — it stays on this device only.
          </Text>
          <View style={styles.apiKeyRow}>
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="sk-ant-..."
              placeholderTextColor={Colors.muted}
              secureTextEntry={!apiKeyVisible}
              style={styles.apiKeyInput}
              selectionColor={Colors.amber}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setApiKeyVisible(!apiKeyVisible)}
              style={styles.apiKeyToggle}
              activeOpacity={0.7}
            >
              <Text style={styles.apiKeyToggleText}>{apiKeyVisible ? 'hide' : 'show'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.button, !apiKey.trim() && styles.buttonDisabled]}
            onPress={handleSaveApiKey}
            activeOpacity={0.8}
            disabled={!apiKey.trim()}
          >
            <Text style={styles.buttonText}>{saved ? 'saved ✓' : 'save key'}</Text>
          </TouchableOpacity>
        </View>

        {/* Data */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>your data</Text>
          <Text style={styles.sectionNote}>
            Everything lives on this device. No account, no cloud, no sync.
          </Text>

          <TouchableOpacity style={styles.actionRow} onPress={handleExport} activeOpacity={0.75}>
            <View>
              <Text style={styles.actionTitle}>Export all entries</Text>
              <Text style={styles.actionSubtitle}>plain text, all instruments</Text>
            </View>
            <Text style={styles.actionArrow}>↑</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionRow} onPress={handleClearData} activeOpacity={0.75}>
            <View>
              <Text style={[styles.actionTitle, styles.destructive]}>Clear all data</Text>
              <Text style={styles.actionSubtitle}>cannot be undone</Text>
            </View>
            <Text style={[styles.actionArrow, styles.destructive]}>×</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>about swell</Text>
          <Text style={styles.aboutText}>
            Swell is a pocket creative instrument where passing states, shifting conditions, and relational atmospheres become lines worth keeping.
          </Text>
          <Text style={styles.aboutText}>
            Terrain reads the condition. Constellation reads the field. Tide, Drift, Verso, and Paradox turn those readings into language.
          </Text>
          <Text style={styles.version}>v1.0</Text>
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
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
    backgroundColor: Colors.card,
  },
  apiKeyInput: {
    flex: 1,
    color: Colors.saltWhite,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    padding: Spacing.md,
  },
  apiKeyToggle: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  apiKeyToggleText: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
  },
  button: {
    backgroundColor: Colors.amber,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: Colors.deepNavy,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    fontWeight: '600',
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
