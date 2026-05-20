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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Avatar } from '../../../components/Avatar';
import { Card } from '../../../components/Card';
import { Badge, BadgeVariant } from '../../../components/Badge';
import { colors, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdminInterventions, AdminIntervention } from '../../../hooks/useAdminInterventions';

export default function AdminReports() {
  const { profile } = useAuth();
  const { items, loading, refresh } = useAdminInterventions({
    status: ['pending_validation', 'validated', 'rejected'],
  });

  const initials = useMemo(() => {
    const full = profile?.full_name?.trim() ?? '';
    return (
      full.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'A'
    );
  }, [profile?.full_name]);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const ta = (a.submitted_at ?? a.scheduled_at) as string;
        const tb = (b.submitted_at ?? b.scheduled_at) as string;
        return ta < tb ? 1 : -1;
      }),
    [items]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Les Partenaires DM" leadingAvatar={<Avatar size={32} initials={initials} />} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 18,
          paddingBottom: 120,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <View>
          <Text style={{ ...typography.h2, color: colors.primary }}>Rapports d'intervention</Text>
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 14, marginTop: 6, lineHeight: 22 }}>
            Suivi des interventions soumises, validées ou rejetées.
          </Text>
        </View>

        {loading && sorted.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : sorted.length === 0 ? (
          <Card padding={28}>
            <View style={styles.emptyState}>
              <MaterialIcons name="description" size={42} color={colors.primary} />
              <Text style={styles.emptyTitle}>Aucun rapport</Text>
              <Text style={styles.emptySub}>
                Les interventions soumises par les agents apparaîtront ici.
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            {sorted.map((iv) => (
              <ReportRow key={iv.id} intervention={iv} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportRow({ intervention }: { intervention: AdminIntervention }) {
  const date = new Date(intervention.submitted_at ?? intervention.scheduled_at);
  const variant: BadgeVariant =
    intervention.status === 'validated' && intervention.global_result === 'ok'
      ? 'success'
      : intervention.status === 'validated' && intervention.global_result === 'to_improve'
      ? 'warning'
      : intervention.status === 'rejected'
      ? 'error'
      : 'warning';
  const label =
    intervention.status === 'validated' && intervention.global_result === 'to_improve'
      ? 'À AMÉLIORER'
      : intervention.status === 'validated'
      ? 'VALIDÉ'
      : intervention.status === 'rejected'
      ? 'REJETÉ'
      : 'À VALIDER';

  return (
    <Pressable
      onPress={() =>
        router.push(`/(admin)/validation?intervention_id=${intervention.id}`)
      }
    >
      <Card padding={16}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Text style={styles.dateLabel}>
            {date
              .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
              .toUpperCase()}
          </Text>
          <Badge label={label} variant={variant} small />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
          {intervention.site?.name ?? 'Site inconnu'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <MaterialIcons name="badge" size={14} color={colors.onSurfaceVariant} />
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>
            Agent : {intervention.agent?.full_name ?? '—'}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dateLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: colors.secondary },
  emptyState: { alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  emptySub: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
});
