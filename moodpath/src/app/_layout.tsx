import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

import { T } from '@/ui/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: T.bg },
          headerTintColor: T.ink,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: T.bg },
        }}>
        <Stack.Screen name="index" options={{ title: 'Now' }} />
        <Stack.Screen name="consent" options={{ title: 'Before we start', presentation: 'modal' }} />
        <Stack.Screen name="journey" options={{ title: 'Journey' }} />
        <Stack.Screen name="summary" options={{ title: 'How that went' }} />
        <Stack.Screen name="library" options={{ title: 'Library' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="spotify" options={{ title: 'With Spotify' }} />
      </Stack>
    </>
  );
}
