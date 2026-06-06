import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Avatar } from '../../components/Avatar';
import { colors, radii, responsive, typography } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useAdminClientUsers } from '../../hooks/useAdminClientUsers';
import { notifyEvent } from '../../lib/notifications';

export default function ClientNew() {
  const [name, setName] = useState('');
  const [contractType, setContractType] = useState('');
  const [linkedUsers, setLinkedUsers] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const { users, loading: usersLoading, refresh: refreshUsers } = useAdminClientUsers({
    scope: 'unassigned',
  });

  const toggle = (id: string) => {
    setLinkedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Champ requis', "Le nom de l'entreprise est requis.");
      return;
    }
    setSubmitting(true);

    // 1) Crée l'entreprise
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .insert({
        name: name.trim(),
        contract_type: contractType.trim() || null,
      })
      .select()
      .single();

    if (clientErr || !client) {
      setSubmitting(false);
      Alert.alert('Erreur', clientErr?.message ?? 'Impossible de créer le client');
      return;
    }

    // 2) Rattache les comptes utilisateurs sélectionnés
    if (linkedUsers.size > 0) {
      const { error: linkErr } = await supabase
        .from('profiles')
        .update({ client_id: client.id })
        .in('id', Array.from(linkedUsers));

      if (linkErr) {
        setSubmitting(false);
        Alert.alert(
          'Client créé mais',
          `Erreur de rattachement des comptes : ${linkErr.message}`
        );
        router.back();
        return;
      }
      for (const userId of linkedUsers) notifyEvent('client_linked', userId);
    }

    setSubmitting(false);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Nouveau client" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: responsive.hPadding,
            paddingTop: 16,
            paddingBottom: 120,
            gap: 18,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text style={{ ...typography.h2, color: colors.primary }}>Ajouter un client</Text>
            <Text style={styles.subtitle}>
              Crée l'entreprise puis rattache un ou plusieurs comptes utilisateurs (optionnel).
              Les utilisateurs rattachés verront automatiquement tous les sites de cette
              entreprise dans leur app.
            </Text>
          </View>

          <Card padding={22}>
            <Field label="NOM DE L'ENTREPRISE *">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="ex: Nexus Corp"
                placeholderTextColor={colors.outline}
                style={styles.input}
                autoCapitalize="words"
              />
            </Field>

            <Field label="TYPE DE CONTRAT">
              <TextInput
                value={contractType}
                onChangeText={setContractType}
                placeholder="ex: Maintenance annuelle"
                placeholderTextColor={colors.outline}
                style={styles.input}
              />
            </Field>
          </Card>

          <Card padding={22}>
            <View style={styles.linkHeader}>
              <View style={styles.linkIcon}>
                <MaterialIcons name="link" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.h3, color: colors.primary }}>
                  Rattacher des comptes
                </Text>
                <Text style={styles.linkHint}>
                  Optionnel — comptes utilisateurs (rôle "Client") non encore rattachés.
                </Text>
              </View>
              <Pressable onPress={refreshUsers} style={styles.refreshBtn}>
                <MaterialIcons name="refresh" size={20} color={colors.primary} />
              </Pressable>
            </View>

            {usersLoading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 24 }} />
            ) : users.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialIcons name="person-off" size={28} color={colors.outline} />
                <Text style={styles.emptyTitle}>Aucun compte client disponible</Text>
                <Text style={styles.emptySub}>
                  Quand un utilisateur s'inscrira avec le rôle "Client", il apparaîtra ici. Tu
                  pourras le rattacher en revenant sur cet écran.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={styles.selectionCount}>
                  {linkedUsers.size} sélectionné{linkedUsers.size > 1 ? 's' : ''} sur{' '}
                  {users.length}
                </Text>
                {users.map((u) => {
                  const selected = linkedUsers.has(u.id);
                  const initials =
                    (u.full_name ?? u.email ?? '?')
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((s) => s[0]?.toUpperCase())
                      .join('') || '?';
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => toggle(u.id)}
                      style={[
                        styles.userRow,
                        selected && {
                          backgroundColor: 'rgba(0, 35, 111, 0.06)',
                          borderColor: colors.primary,
                        },
                      ]}
                    >
                      <Avatar size={36} initials={initials} variant="primary" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ fontSize: 14, fontWeight: '700', color: colors.onSurface }}
                          numberOfLines={1}
                        >
                          {u.full_name ?? 'Sans nom'}
                        </Text>
                        {u.email ? (
                          <Text
                            style={{ fontSize: 12, color: colors.onSurfaceVariant }}
                            numberOfLines={1}
                          >
                            {u.email}
                          </Text>
                        ) : null}
                      </View>
                      <MaterialIcons
                        name={selected ? 'check-box' : 'check-box-outline-blank'}
                        size={22}
                        color={selected ? colors.primary : colors.outline}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Card>

          <PrimaryButton
            label={submitting ? 'Création...' : 'Créer le client'}
            icon="check-circle"
            size="lg"
            disabled={submitting}
            onPress={onSubmit}
          />
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
  subtitle: { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 8, lineHeight: 22 },
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
    fontSize: 15,
    color: colors.onSurface,
  },
  linkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkHint: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
    lineHeight: 17,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  emptySub: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  selectionCount: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: colors.onSurfaceVariant,
    marginBottom: 6,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: 'rgba(196, 197, 211, 0.18)',
    backgroundColor: colors.surface,
  },
});
