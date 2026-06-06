import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';
import { AuthProvider } from '../contexts/AuthContext';
import { PushNotificationsProvider } from '../contexts/PushNotificationsContext';
import { ForceUpdateGate } from '../components/ForceUpdateGate';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <AuthProvider>
          <PushNotificationsProvider>
            <StatusBar style="dark" backgroundColor={colors.background} />
            <ForceUpdateGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(client)" />
                <Stack.Screen name="(agent)" />
                <Stack.Screen name="(admin)" />
                <Stack.Screen name="legal" />
              </Stack>
            </ForceUpdateGate>
          </PushNotificationsProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
