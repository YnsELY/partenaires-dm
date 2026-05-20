import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Avatar } from '../../../components/Avatar';
import { Card } from '../../../components/Card';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useAdminAgents } from '../../../hooks/useAdminAgents';
import { supabase } from '../../../lib/supabase';

export default function AdminAgents() {
  const { agents, loading: agentsLoading, refresh: refreshAgents } = useAdminAgents();

  const [agentForm, setAgentForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
  });
  const [creatingAgent, setCreatingAgent] = useState(false);

  const onCreateAgent = async () => {
    const { full_name, phone, email, password } = agentForm;
    if (!full_name.trim() || !email.trim() || password.length < 6) {
      Alert.alert(
        'Champs requis',
        'Nom, email et mot de passe (≥ 6 caractères) sont obligatoires.'
      );
      return;
    }
    setCreatingAgent(true);
    const { data, error } = await supabase.functions.invoke('admin-create-agent', {
      body: {
        full_name: full_name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim(),
        password,
      },
    });
    setCreatingAgent(false);

    if (error || (data as any)?.error) {
      Alert.alert(
        'Création impossible',
        (data as any)?.error ?? error?.message ?? 'Erreur inconnue'
      );
      return;
    }

    Alert.alert(
      'Agent créé',
      `Identifiants à transmettre à l'agent :\nEmail : ${email}\nMot de passe : ${password}`
    );
    setAgentForm({ full_name: '', phone: '', email: '', password: '' });
    refreshAgents();
  };

  const initialsOf = (name: string | null | undefined) =>
    (name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Agents" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 18,
          paddingBottom: 120,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={agentsLoading}
            onRefresh={refreshAgents}
            tintColor={colors.primary}
          />
        }
      >
        <View>
          <Text style={{ ...typography.h1, color: colors.onSurface }}>Gestion des Agents</Text>
          <Text style={styles.subtitle}>
            Crée des comptes agents pour ton équipe d'intervention.
          </Text>
        </View>

        <Card padding={22}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <View style={styles.formIcon}>
              <MaterialIcons name="person-add" size={22} color={colors.primary} />
            </View>
            <Text style={{ ...typography.h3, color: colors.primary }}>Ajouter un agent</Text>
          </View>

          <Field label="NOM COMPLET *">
            <TextInput
              value={agentForm.full_name}
              onChangeText={(v) => setAgentForm((s) => ({ ...s, full_name: v }))}
              placeholder="Jean Dupont"
              placeholderTextColor={colors.outline}
              style={styles.input}
              autoCapitalize="words"
            />
          </Field>
          <Field label="TÉLÉPHONE">
            <TextInput
              value={agentForm.phone}
              onChangeText={(v) => setAgentForm((s) => ({ ...s, phone: v }))}
              placeholder="+33 6 00 00 00 00"
              placeholderTextColor={colors.outline}
              style={styles.input}
              keyboardType="phone-pad"
            />
          </Field>
          <Field label="EMAIL PROFESSIONNEL *">
            <TextInput
              value={agentForm.email}
              onChangeText={(v) => setAgentForm((s) => ({ ...s, email: v }))}
              placeholder="j.dupont@partenaires-dm.fr"
              placeholderTextColor={colors.outline}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </Field>
          <Field label="MOT DE PASSE TEMPORAIRE *">
            <TextInput
              value={agentForm.password}
              onChangeText={(v) => setAgentForm((s) => ({ ...s, password: v }))}
              placeholder="Minimum 6 caractères"
              placeholderTextColor={colors.outline}
              style={styles.input}
              secureTextEntry
            />
            <Text style={styles.helper}>
              L'agent pourra le changer plus tard depuis son profil.
            </Text>
          </Field>

          <PrimaryButton
            label={creatingAgent ? 'Création…' : "Créer l'agent"}
            icon="check-circle"
            disabled={creatingAgent}
            onPress={onCreateAgent}
            style={{ marginTop: 8 }}
          />
        </Card>

        <View>
          <View style={styles.listHeader}>
            <Text style={{ ...typography.h3, color: colors.primary }}>Liste des agents</Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>
                {agents.length} ACTIF{agents.length > 1 ? 'S' : ''}
              </Text>
            </View>
          </View>

          {agentsLoading && agents.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : agents.length === 0 ? (
            <Card padding={20} variant="low" noShadow>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="people-outline" size={28} color={colors.outline} />
                <Text style={{ color: colors.onSurfaceVariant, fontSize: 13, textAlign: 'center' }}>
                  Aucun agent pour l'instant. Crée-en un avec le formulaire ci-dessus.
                </Text>
              </View>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {agents.map((a) => (
                <View key={a.id} style={styles.agentRow}>
                  <Avatar size={44} initials={initialsOf(a.full_name)} variant="secondary" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ fontSize: 15, fontWeight: '700', color: colors.onSurface }}
                      numberOfLines={1}
                    >
                      {a.full_name ?? 'Agent sans nom'}
                    </Text>
                    {a.email ? (
                      <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }} numberOfLines={1}>
                        {a.email}
                      </Text>
                    ) : null}
                    {a.phone ? (
                      <Text style={{ fontSize: 12, color: colors.outline, marginTop: 2 }} numberOfLines={1}>
                        {a.phone}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.smallLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 8, lineHeight: 22 },
  formIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0, 35, 111, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.onSurfaceVariant,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.onSurface,
  },
  helper: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 4 },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  activeBadge: {
    backgroundColor: 'rgba(100, 186, 254, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  activeBadgeText: { color: colors.secondary, fontSize: 10, fontWeight: '700', letterSpacing: 1.3 },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
});
