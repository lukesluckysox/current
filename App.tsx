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

import InstrumentSelector from './src/screens/InstrumentSelector';
import DriftScreen from './src/screens/DriftScreen';
import TideScreen from './src/screens/TideScreen';
import VersoScreen from './src/screens/VersoScreen';
import ParadoxScreen from './src/screens/ParadoxScreen';
import TerrainScreen from './src/screens/TerrainScreen';
import ConstellationScreen from './src/screens/ConstellationScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export type RootStackParamList = {
  Selector: undefined;
  Drift: undefined;
  Tide: undefined;
  Verso: undefined;
  Paradox: undefined;
  Terrain: undefined;
  Constellation: undefined;
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
        <Text style={styles.splashName}>Swell</Text>
        {dbError && <Text style={styles.splashError}>{dbError}</Text>}
      </View>
    );
  }

  return (
    <NavigationContainer theme={NAV_THEME}>
      <StatusBar barStyle="light-content" />
      <Stack.Navigator
        initialRouteName="Selector"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: Colors.deepNavy },
        }}
      >
        <Stack.Screen name="Selector" component={InstrumentSelector} />
        <Stack.Screen name="Drift" component={DriftScreen} />
        <Stack.Screen name="Tide" component={TideScreen} />
        <Stack.Screen name="Verso" component={VersoScreen} />
        <Stack.Screen name="Paradox" component={ParadoxScreen} />
        <Stack.Screen name="Terrain" component={TerrainScreen} />
        <Stack.Screen name="Constellation" component={ConstellationScreen} />
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
