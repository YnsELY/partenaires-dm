import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Avatar } from '../../../components/Avatar';
import { Card } from '../../../components/Card';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdminClients } from '../../../hooks/useAdminClients';

export default function AdminClients() {
  const { profile } = useAuth();
  const { clients, loading, refresh } = useAdminClients();

  const initials = useMemo(() => {
    const full = profile?.full_name?.trim() ?? '';
    return (
      full.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'A'
    );
  }, [profile?.full_name]);

  const totalSites = useMemo(
    () => clients.reduce((acc, c) => acc + c.site_count, 0),
    [clients]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Les Partenaires DM" leadingAvatar={<Avatar size={32} initials={initials} />} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 18,
          paddingBottom: 140,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <View>
          <Text style={{ ...typography.h1, color: colors.primary }}>Mes Clients</Text>
          <Text style={styles.subtitle}>
            Gère ton portefeuille de clients B2B et leurs sites actifs.
          </Text>
        </View>

        <LinearGradient colors={[colors.primary, colors.primaryContainer]} style={styles.statHero}>
          <Text style={{ color: '#fff', fontSize: 56, fontWeight: '800' }}>{totalSites}</Text>
          <Text
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1.4,
            }}
          >
            SITES ACTIFS
          </Text>
        </LinearGradient>

        {loading && clients.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : clients.length === 0 ? (
          <Card padding={28}>
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="business-center" size={42} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Aucun client</Text>
              <Text style={styles.emptySub}>
                Ajoute ton premier client en utilisant le bouton + en bas à droite.
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            {clients.map((c) => {
              const cInitials = (c.name ?? '?')
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase())
                .join('');
              return (
                <Pressable key={c.id} style={styles.row}>
                  <Avatar initials={cInitials} size={48} variant="primary" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: colors.primary }} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 }} numberOfLines={1}>
                      {c.contract_type ?? 'Pas de type de contrat'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: colors.onSurface }}>
                      {c.site_count}
                    </Text>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: colors.outline, letterSpacing: 1.4 }}>
                      SITES
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/(admin)/client-new')}>
        <MaterialIcons name="add" size={26} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 8, lineHeight: 22 },
  statHero: {
    borderRadius: radii.xl,
    padding: 26,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
    shadowColor: '#00236f',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    gap: 6,
  },
  emptyState: { alignItems: 'center', gap: 10 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  emptySub: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 16,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  fab: {
    position: 'absolute',
    right: responsive.hPadding,
    bottom: 100,
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00236f',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
