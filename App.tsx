import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import {
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import { Colors, Fonts } from './src/theme';
import { initDatabase } from './src/db/database';

import DriftScreen from './src/screens/DriftScreen';
import VersoScreen from './src/screens/VersoScreen';
import LinesScreen from './src/screens/LinesScreen';
import LineDetailScreen from './src/screens/LineDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export type LineFilter = {
  kind: 'tide' | 'terrain' | 'constellation' | 'mode' | 'topic';
  value: string;
};

export type RootStackParamList = {
  Drift: undefined;
  Verso: { seedContent?: string; seedMode?: string; seedLineId?: number } | undefined;
  Lines: { filter?: LineFilter } | undefined;
  LineDetail: { lineId: number };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const NAV_THEME = {
  dark: true,
  colors: {
    primary: Colors.amber,
    background: Colors.deepNavy,
    card: Colors.navy,
    text: Colors.saltWhite,
    border: Colors.border,
    notification: Colors.amber,
  },
  fonts: {
    regular: { fontFamily: Fonts.sans as string, fontWeight: '400' as const },
    medium: { fontFamily: Fonts.sans as string, fontWeight: '500' as const },
    bold: { fontFamily: Fonts.sans as string, fontWeight: '700' as const },
    heavy: { fontFamily: Fonts.sans as string, fontWeight: '900' as const },
  },
};

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    CormorantGaramond_400Regular,
    CormorantGaramond_400Regular_Italic,
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
  });

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('DB init failed:', err);
        setDbError(err?.message ?? 'Database error');
      });
  }, []);

  if (!fontsLoaded || !dbReady) {
    return (
      <View style={styles.splash}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.splashName}>Current</Text>
        {dbError && <Text style={styles.splashError}>{dbError}</Text>}
      </View>
    );
  }

  return (
    <NavigationContainer theme={NAV_THEME}>
      <StatusBar barStyle="light-content" />
      <Stack.Navigator
        initialRouteName="Drift"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: Colors.deepNavy },
        }}
      >
        <Stack.Screen name="Drift" component={DriftScreen} />
        <Stack.Screen name="Verso" component={VersoScreen} />
        <Stack.Screen name="Lines" component={LinesScreen} />
        <Stack.Screen name="LineDetail" component={LineDetailScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.deepNavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashName: {
    color: Colors.saltWhite,
    fontSize: 52,
    fontFamily: 'System',
    letterSpacing: -1,
  },
  splashError: {
    color: Colors.error,
    fontSize: 12,
    marginTop: 16,
    fontFamily: 'System',
  },
});
