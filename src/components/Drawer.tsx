import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Easing, Pressable, Platform,
} from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../theme';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type DrawerProps = {
  visible: boolean;
  onClose: () => void;
};

// Surfaces the user can navigate to. Order chosen to match the way the app
// actually flows: capture (Drift) → shape (Verso) → ground (Stillwater) →
// review (Lines) → adjust (Settings).
const ROUTES: Array<{ name: keyof RootStackParamList; label: string; hint: string }> = [
  { name: 'Drift',      label: 'drift',      hint: 'capture the thought' },
  { name: 'Verso',      label: 'verso',      hint: 'twist it into form' },
  { name: 'Stillwater', label: 'stillwater', hint: 'ground a real one' },
  { name: 'Lines',      label: 'depth stack', hint: 'every line, kept' },
  { name: 'Settings',   label: 'settings',   hint: 'voice, signal, account' },
];

export function Drawer({ visible, onClose }: DrawerProps) {
  const navigation = useNavigation<Nav>();
  const currentRoute = useNavigationState((s) => {
    if (!s) return null;
    const route = s.routes[s.index];
    return route?.name ?? null;
  });
  const { scheme, toggle } = useTheme();
  const auth = useAuth();

  // Slide-in animation. The panel translates from the right edge inward.
  const slide = useRef(new Animated.Value(visible ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 320],
  });

  function go(name: keyof RootStackParamList) {
    onClose();
    // Defer the navigate so the close animation can begin first; feels less
    // jarring on web where there's no native ease-out.
    setTimeout(() => {
      // @ts-expect-error — RootStackParamList entries with `undefined` params
      navigation.navigate(name);
    }, 60);
  }

  async function handleLogout() {
    onClose();
    if (auth.status === 'authenticated') {
      try {
        await auth.signOut();
      } catch {
        // best-effort; AuthGate will recover on next refresh
      }
    }
  }

  // Logout only makes sense when there's a session to end. In dev/disabled
  // mode the auth context reports 'disabled' and we hide the row.
  const showLogout = auth.status === 'authenticated';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityLabel="close menu"
      >
        {/* The panel itself swallows touches so taps inside don't dismiss. */}
        <Animated.View
          style={[styles.panel, { transform: [{ translateX }] }]}
          // @ts-ignore — Pressable inside Animated.View is fine; we just
          // need to prevent the scrim's onPress from firing through.
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.panelInner}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>menu</Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityLabel="close menu"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.closeIcon}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>surfaces</Text>
            {ROUTES.map((r) => {
              const active = currentRoute === r.name;
              return (
                <TouchableOpacity
                  key={r.name}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => go(r.name)}
                  activeOpacity={0.7}
                  accessibilityLabel={`go to ${r.label}`}
                  testID={`drawer-${String(r.name).toLowerCase()}`}
                >
                  <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                    {r.label}
                  </Text>
                  <Text style={[styles.rowHint, active && styles.rowHintActive]}>
                    {r.hint}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>light</Text>
            <TouchableOpacity
              style={styles.row}
              onPress={toggle}
              activeOpacity={0.7}
              accessibilityLabel={`switch to ${scheme === 'dark' ? 'light' : 'dark'} mode`}
              testID="drawer-theme-toggle"
            >
              <Text style={styles.rowLabel}>
                {scheme === 'dark' ? 'turn the lights on' : 'turn the lights down'}
              </Text>
              <Text style={styles.rowHint}>
                {scheme === 'dark' ? 'waikiki shallows' : 'abyssal teal'}
              </Text>
            </TouchableOpacity>

            {showLogout && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.row}
                  onPress={handleLogout}
                  activeOpacity={0.7}
                  accessibilityLabel="log out"
                  testID="drawer-logout"
                >
                  <Text style={[styles.rowLabel, styles.rowLogout]}>log out</Text>
                  <Text style={styles.rowHint}>leave the water</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  panel: {
    width: 320,
    maxWidth: '85%',
    height: '100%',
    backgroundColor: Colors.navy,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: -4, height: 0 } },
      android: { elevation: 16 },
      default: {},
    }),
  },
  panelInner: {
    flex: 1,
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    letterSpacing: 1,
  },
  closeIcon: {
    color: Colors.muted,
    fontSize: 28,
    fontFamily: Fonts.sans,
    lineHeight: 28,
    paddingHorizontal: Spacing.xs,
  },
  sectionLabel: {
    color: Colors.muted,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  row: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.xs,
  },
  rowActive: {
    backgroundColor: Colors.cardAlt,
  },
  rowLabel: {
    color: Colors.saltWhite,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    letterSpacing: 0.3,
  },
  rowLabelActive: {
    color: Colors.amberLight,
  },
  rowHint: {
    color: Colors.muted,
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  rowHintActive: {
    color: Colors.sandLight,
  },
  rowLogout: {
    color: Colors.error,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
});
