import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { colors, radii, responsive, typography } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useAllAccounts } from '../../hooks/useAllAccounts';
import { useAdminClients } from '../../hooks/useAdminClients';
import { supabase, Profile, Role } from '../../lib/supabase';

const ROLE_SECTIONS: { role: Role; title: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { role: 'admin', title: 'Administrateurs', icon: 'admin-panel-settings' },
  { role: 'agent', title: 'Agents', icon: 'badge' },
  { role: 'client', title: 'Comptes clients', icon: 'person' },
];

const ROLE_BADGE: Record<Role, { label: string; variant: 'primary' | 'secondary' | 'warning' }> = {
  admin: { label: 'ADMIN', variant: 'warning' },
  agent: { label: 'AGENT', variant: 'secondary' },
  client: { label: 'CLIENT', variant: 'primary' },
};

function initialsOf(name: string | null | undefined, fallback = '?') {
  return (
    (name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || fallback
  );
}

export default function AdminComptes() {
  const { profile: me } = useAuth();
  const { accounts, loading: accountsLoading, refresh: refreshAccounts } = useAllAccounts();
  const { clients, loading: clientsLoading, refresh: refreshClients } = useAdminClients();

  const [busyId, setBusyId] = useState<string | null>(null);

  const accountsByRole = useMemo(() => {
    const map: Record<Role, Profile[]> = { admin: [], agent: [], client: [] };
    for (const a of accounts) {
      (map[a.role] ??= []).push(a);
    }
    return map;
  }, [accounts]);

  const refreshAll = () => {
    refreshAccounts();
    refreshClients();
  };

  const deleteAccount = (account: Profile) => {
    const name = account.full_name ?? account.email ?? 'ce compte';
    Alert.alert(
      'Supprimer le compte',
      `Supprimer définitivement le compte de ${name} ?\n\nCette action est irréversible. L'utilisateur perdra l'accès à l'application et ses données associées seront supprimées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setBusyId(account.id);
            const { data, error } = await supabase.functions.invoke('delete-account', {
              body: { user_id: account.id },
            });
            setBusyId(null);
            if (error || (data as any)?.error) {
              Alert.alert(
                'Suppression impossible',
                (data as any)?.error ?? error?.message ?? 'Erreur inconnue'
              );
              return;
            }
            refreshAccounts();
          },
        },
      ]
    );
  };

  const deleteCompany = (id: string, name: string, siteCount: number) => {
    Alert.alert(
      'Supprimer l\'entreprise cliente',
      `Supprimer définitivement « ${name} » ?\n\n` +
        (siteCount > 0
          ? `⚠️ Ses ${siteCount} site(s) actif(s) ainsi que toutes les interventions, checklists et photos associées seront également supprimés. `
          : '') +
        'Les comptes clients rattachés seront déliés (mais pas supprimés). Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setBusyId(id);
            const { error } = await supabase.from('clients').delete().eq('id', id);
            setBusyId(null);
            if (error) {
              Alert.alert('Suppression impossible', error.message);
              return;
            }
            refreshClients();
          },
        },
      ]
    );
  };

  const loading = accountsLoading || clientsLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Comptes" onBack={() => router.back()} hideRight />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 18,
          paddingBottom: 120,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshAll} tintColor={colors.primary} />
        }
      >
        <View>
          <Text style={{ ...typography.h1, color: colors.onSurface }}>Gestion des comptes</Text>
          <Text style={styles.subtitle}>
            Consulte et supprime les comptes utilisateurs et les entreprises clientes.
          </Text>
        </View>

        {/* Comptes utilisateurs, groupés par rôle */}
        {ROLE_SECTIONS.map((section) => {
          const list = accountsByRole[section.role] ?? [];
          return (
            <View key={section.role}>
              <View style={styles.sectionHeader}>
                <MaterialIcons name={section.icon} size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{list.length}</Text>
                </View>
              </View>

              {accountsLoading && list.length === 0 ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : list.length === 0 ? (
                <Card padding={16} variant="low" noShadow>
                  <Text style={styles.emptyText}>Aucun compte dans cette catégorie.</Text>
                </Card>
              ) : (
                <View style={{ gap: 10 }}>
                  {list.map((a) => {
                    const isMe = a.id === me?.id;
                    const badge = ROLE_BADGE[a.role];
                    return (
                      <View key={a.id} style={styles.row}>
                        <Avatar
                          size={44}
                          initials={initialsOf(a.full_name ?? a.email)}
                          variant={a.role === 'agent' ? 'secondary' : 'primary'}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text
                              style={{ fontSize: 15, fontWeight: '700', color: colors.onSurface, flexShrink: 1 }}
                              numberOfLines={1}
                            >
                              {a.full_name ?? 'Sans nom'}
                            </Text>
                            <Badge label={badge.label} variant={badge.variant} small />
                          </View>
                          {a.email ? (
                            <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }} numberOfLines={1}>
                              {a.email}
                            </Text>
                          ) : null}
                        </View>

                        {isMe ? (
                          <View style={styles.youPill}>
                            <Text style={styles.youPillText}>VOUS</Text>
                          </View>
                        ) : busyId === a.id ? (
                          <ActivityIndicator color={colors.error} style={{ width: 40 }} />
                        ) : (
                          <Pressable
                            style={styles.deleteBtn}
                            onPress={() => deleteAccount(a)}
                            hitSlop={8}
                          >
                            <MaterialIcons name="delete-outline" size={22} color={colors.error} />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {/* Entreprises clientes */}
        <View>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="business" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Entreprises clientes</Text>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{clients.length}</Text>
            </View>
          </View>

          {clientsLoading && clients.length === 0 ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : clients.length === 0 ? (
            <Card padding={16} variant="low" noShadow>
              <Text style={styles.emptyText}>Aucune entreprise cliente.</Text>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {clients.map((c) => (
                <View key={c.id} style={styles.row}>
                  <Avatar size={44} initials={initialsOf(c.name)} variant="primary" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{ fontSize: 15, fontWeight: '700', color: colors.onSurface }}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }} numberOfLines={1}>
                      {c.site_count} site(s) actif(s)
                      {c.contract_type ? ` • ${c.contract_type}` : ''}
                    </Text>
                  </View>
                  {busyId === c.id ? (
                    <ActivityIndicator color={colors.error} style={{ width: 40 }} />
                  ) : (
                    <Pressable
                      style={styles.deleteBtn}
                      onPress={() => deleteCompany(c.id, c.name, c.site_count)}
                      hitSlop={8}
                    >
                      <MaterialIcons name="delete-outline" size={22} color={colors.error} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 8, lineHeight: 22 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: { ...typography.h3, color: colors.primary, flex: 1 },
  countPill: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    minWidth: 28,
    alignItems: 'center',
  },
  countPillText: { fontSize: 12, fontWeight: '700', color: colors.onSecondaryContainer },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(186, 26, 26, 0.08)',
  },
  youPill: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  youPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.onSurfaceVariant,
  },
  emptyText: { fontSize: 13, color: colors.onSurfaceVariant, textAlign: 'center' },
});
