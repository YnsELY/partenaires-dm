import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from './Card';
import { colors, radii, typography } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * Carte « Zone de danger » avec le bouton de suppression définitive du compte
 * de l'utilisateur connecté. Partagée par les écrans compte admin / agent /
 * client. Double confirmation, puis appel de l'edge function `delete-account`
 * (auto-suppression), déconnexion et retour à l'écran de connexion.
 */
export function DeleteAccountCard() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const runDeletion = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: {},
    });

    if (error || (data as any)?.error) {
      setBusy(false);
      Alert.alert(
        'Suppression impossible',
        (data as any)?.error ?? error?.message ?? 'Erreur inconnue'
      );
      return;
    }

    // Le compte n'existe plus : on nettoie la session locale et on revient à
    // l'accueil. Les erreurs de déconnexion (session déjà invalide) sont sans
    // conséquence.
    try {
      await signOut();
    } catch {
      // En dernier recours, on force la suppression de la session locale.
      try {
        await supabase.auth.signOut();
      } catch {
        /* noop */
      }
    }
    setBusy(false);
    router.replace('/');
  };

  const confirm = () => {
    Alert.alert(
      'Supprimer mon compte',
      'Cette action est définitive et irréversible. Toutes tes données seront supprimées et tu perdras l\'accès à l\'application.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Es-tu vraiment sûr·e ?',
              'Confirme la suppression définitive de ton compte.',
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Supprimer définitivement', style: 'destructive', onPress: runDeletion },
              ]
            ),
        },
      ]
    );
  };

  return (
    <Card padding={22}>
      <Text style={styles.cardTitle}>Zone de danger</Text>
      <Text style={styles.helper}>
        La suppression de ton compte est définitive. Cette action ne peut pas être annulée.
      </Text>
      <Pressable style={styles.deleteBtn} onPress={confirm} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.error} />
        ) : (
          <>
            <MaterialIcons name="delete-forever" size={20} color={colors.error} />
            <Text style={styles.deleteText}>Supprimer mon compte</Text>
          </>
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...typography.h3, color: colors.error, marginBottom: 8 },
  helper: { fontSize: 12, color: colors.onSurfaceVariant, lineHeight: 18, marginBottom: 16 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(186, 26, 26, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.25)',
  },
  deleteText: { color: colors.error, fontSize: 15, fontWeight: '700' },
});
