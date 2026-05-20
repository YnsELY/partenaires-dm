import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

export default function AgentLayout() {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/');
      return;
    }
    if (profile && profile.role !== 'agent') {
      // Redirige les autres rôles vers leur espace
      if (profile.role === 'admin') router.replace('/(admin)/(tabs)/home');
      else if (profile.role === 'client') router.replace('/(client)/(tabs)/home');
    }
  }, [session, profile, loading]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="mission/[id]" />
      <Stack.Screen name="chantier/[id]" />
      <Stack.Screen name="conversation/[id]" />
      <Stack.Screen name="incident/[id]" />
    </Stack>
  );
}
