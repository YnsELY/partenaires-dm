import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminLayout() {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/');
      return;
    }
    if (profile && profile.role !== 'admin') {
      if (profile.role === 'agent') router.replace('/(agent)/(tabs)/home');
      else if (profile.role === 'client') router.replace('/(client)/(tabs)/home');
    }
  }, [session, profile, loading]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="validation" />
      <Stack.Screen name="chantier-new" />
      <Stack.Screen name="client-new" />
      <Stack.Screen name="intervention-new" />
      <Stack.Screen name="incident/[id]" />
      <Stack.Screen name="conversation/[id]" />
      <Stack.Screen name="compte" />
    </Stack>
  );
}
