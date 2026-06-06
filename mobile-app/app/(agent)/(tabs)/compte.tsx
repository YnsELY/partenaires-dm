import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Avatar } from '../../../components/Avatar';
import { Card } from '../../../components/Card';
import { Badge } from '../../../components/Badge';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { PushDebugCard } from '../../../components/PushDebugCard';
import { DeleteAccountCard } from '../../../components/DeleteAccountCard';
import { LegalCard } from '../../../components/LegalCard';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

export default function AgentCompte() {
  const { profile, signOut, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const initials = useMemo(() => {
    const full = profile?.full_name?.trim() ?? '';
    return (
      full
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join('') || 'A'
    );
  }, [profile?.full_name]);

  const dirty =
    (fullName.trim() ?? '') !== (profile?.full_name ?? '') ||
    (phone.trim() ?? '') !== (profile?.phone ?? '');

  const onSave = async () => {
    if (!profile) return;
    if (!fullName.trim()) {
      Alert.alert('Champ requis', 'Le nom complet est requis.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (error) {
      Alert.alert('Erreur', error.message);
      return;
    }
    await refreshProfile();
    Alert.alert('Profil mis à jour');
  };

  const onSignOut = () => {
    Alert.alert('Déconnexion', 'Tu es sûr·e de vouloir te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Mon compte" hideRight />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: responsive.hPadding,
            paddingTop: 20,
            paddingBottom: 140,
            gap: 22,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.identityBlock}>
            <Avatar size={88} initials={initials} variant="secondary" />
            <Text style={styles.fullName} numberOfLines={1}>
              {profile?.full_name ?? '—'}
            </Text>
            {profile?.email ? (
              <Text style={styles.email}>{profile.email}</Text>
            ) : null}
            <View style={{ marginTop: 8 }}>
              <Badge label="ESPACE AGENT" variant="secondary" small withDot />
            </View>
          </View>

          <Card padding={22}>
            <Text style={styles.cardTitle}>Informations personnelles</Text>

            <Field label="NOM COMPLET">
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Jean Dupont"
                placeholderTextColor={colors.outline}
                style={styles.input}
                autoCapitalize="words"
              />
            </Field>

            <Field label="TÉLÉPHONE">
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+33 6 00 00 00 00"
                placeholderTextColor={colors.outline}
                style={styles.input}
                keyboardType="phone-pad"
              />
            </Field>

            <Field label="EMAIL">
              <View style={[styles.input, styles.readonly]}>
                <Text style={{ flex: 1, fontSize: 14, color: colors.onSurfaceVariant }} numberOfLines={1}>
                  {profile?.email ?? '—'}
                </Text>
                <MaterialIcons name="lock-outline" size={16} color={colors.outline} />
              </View>
              <Text style={styles.helper}>
                L'email sert d'identifiant de connexion et ne peut pas être modifié ici.
              </Text>
            </Field>

            <PrimaryButton
              label={saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              icon="save"
              disabled={saving || !dirty}
              onPress={onSave}
              style={{ marginTop: 12 }}
            />
          </Card>

          <Card padding={22}>
            <Text style={styles.cardTitle}>Session</Text>
            <Pressable style={styles.signOutBtn} onPress={onSignOut}>
              <MaterialIcons name="logout" size={20} color={colors.error} />
              <Text style={styles.signOutText}>Se déconnecter</Text>
            </Pressable>
          </Card>

          <PushDebugCard />

          <LegalCard />

          <DeleteAccountCard />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  identityBlock: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 18,
  },
  fullName: { ...typography.h2, color: colors.primary, textAlign: 'center', marginTop: 8 },
  email: { fontSize: 13, color: colors.onSurfaceVariant },
  cardTitle: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: colors.onSecondaryContainer,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: colors.onSurface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  readonly: { opacity: 0.85 },
  helper: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 6 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(186, 26, 26, 0.08)',
  },
  signOutText: { color: colors.error, fontSize: 15, fontWeight: '700' },
});
