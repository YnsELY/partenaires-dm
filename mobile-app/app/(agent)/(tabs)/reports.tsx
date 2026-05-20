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
import { Badge } from '../../../components/Badge';
import { colors, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useAgentInterventions, InterventionWithSite } from '../../../hooks/useAgentInterventions';

export default function AgentReports() {
  const { profile } = useAuth();
  const { past, loading, refresh } = useAgentInterventions();

  const initials = useMemo(() => {
    const full = profile?.full_name?.trim() ?? '';
    return (
      full
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join('') || '?'
    );
  }, [profile?.full_name]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Mes rapports"
        leadingAvatar={<Avatar size={32} initials={initials} variant="secondary" />}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 16,
          paddingBottom: 120,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View>
          <Text style={{ ...typography.h2, color: colors.primary }}>
            Historique de mes interventions
          </Text>
          <Text style={styles.subtitle}>
            Tes interventions soumises et leur statut de validation côté admin.
          </Text>
        </View>

        {loading && past.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : past.length === 0 ? (
          <Card padding={28}>
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="description" size={42} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Aucun rapport</Text>
              <Text style={styles.emptySub}>
                Une fois que tu auras soumis ta première intervention, elle apparaîtra ici avec son
                statut de validation.
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            {past.map((iv) => (
              <ReportRow key={iv.id} intervention={iv} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportRow({ intervention }: { intervention: InterventionWithSite }) {
  const date = new Date(intervention.scheduled_at);
  const submitted = intervention.submitted_at ? new Date(intervention.submitted_at) : null;
  const variant: 'success' | 'warning' | 'error' | 'neutral' =
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
      : 'EN ATTENTE';

  return (
    <Pressable onPress={() => router.push(`/(agent)/mission/${intervention.id}`)}>
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
          {intervention.site?.name ?? 'Site'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <MaterialIcons name="schedule" size={14} color={colors.onSurfaceVariant} />
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>
            {submitted
              ? `Soumis le ${submitted.toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                })}`
              : `Programmée à ${date.toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: colors.onSurfaceVariant, fontSize: 14, marginTop: 4, lineHeight: 22 },
  dateLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: colors.secondary },
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
});
