import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

export default function ClientLayout() {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/');
      return;
    }
    if (profile && profile.role !== 'client') {
      if (profile.role === 'admin') router.replace('/(admin)/(tabs)/home');
      else if (profile.role === 'agent') router.replace('/(agent)/(tabs)/home');
    }
  }, [session, profile, loading]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="intervention/[id]" />
      <Stack.Screen name="chantier/[id]" />
      <Stack.Screen name="incident/[id]" />
      <Stack.Screen name="conversation/[id]" />
      <Stack.Screen name="signalement" />
      <Stack.Screen name="compte" />
    </Stack>
  );
}
