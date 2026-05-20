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
import { Badge } from '../../../components/Badge';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useAgentInterventions, InterventionWithSite } from '../../../hooks/useAgentInterventions';
import { useAgentIncidents, AgentIncident } from '../../../hooks/useAgentIncidents';
import { incidentDisplay } from '../../../lib/incidentStatus';

export default function AgentHome() {
  const { profile, signOut } = useAuth();
  const { today, upcoming, inProgress, loading, refresh } = useAgentInterventions();
  // Par défaut le hook filtre déjà sur les statuts actifs (assigned,
  // in_progress, pending_validation) — pas besoin de passer un filtre ici.
  const { items: assignedIncidents, refresh: refreshIncidents } = useAgentIncidents();

  const firstName = useMemo(() => {
    const full = profile?.full_name?.trim() ?? '';
    return full.split(' ')[0] || 'Agent';
  }, [profile?.full_name]);

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

  const weekUpcoming = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 7);
    return upcoming
      .filter((i) => new Date(i.scheduled_at) <= limit)
      .slice(0, 5);
  }, [upcoming]);

  const isEmpty = !loading && today.length === 0 && upcoming.length === 0 && inProgress.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Les Partenaires DM"
        leadingAvatar={<Avatar size={32} initials={initials} variant="secondary" />}
        rightIcon="logout"
        onRightPress={signOut}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingBottom: 120,
          paddingTop: 18,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              refresh();
              refreshIncidents();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View>
          <Text style={styles.greeting}>Bonjour,</Text>
          <Text style={styles.firstName}>{firstName}</Text>
          {profile ? (
            <Text style={styles.role}>Espace agent</Text>
          ) : null}
        </View>

        <View style={styles.kpiRow}>
          <Kpi label="AUJOURD'HUI" value={today.length} icon="event" />
          <KpiHighlight label="EN COURS" value={inProgress.length} icon="play-circle-fill" />
          <Kpi label="À VENIR" value={upcoming.length} icon="schedule" />
        </View>

        {loading && isEmpty ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isEmpty ? (
          <Card padding={28}>
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="event-available" size={42} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Aucune intervention assignée</Text>
              <Text style={styles.emptySub}>
                Tu verras tes missions ici dès qu'une équipe ou un admin t'aura assigné un chantier.
              </Text>
            </View>
          </Card>
        ) : (
          <>
            {assignedIncidents.length > 0 ? (
              <View style={{ gap: 12 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 4,
                  }}
                >
                  <MaterialIcons name="report" size={22} color={colors.error} />
                  <Text style={{ ...typography.h3, color: colors.primary }}>
                    Signalements à traiter
                  </Text>
                  <View style={styles.countPill}>
                    <Text style={styles.countPillText}>{assignedIncidents.length}</Text>
                  </View>
                </View>
                {assignedIncidents.map((inc) => (
                  <IncidentRow key={inc.id} incident={inc} />
                ))}
              </View>
            ) : null}

            <Section title="Aujourd'hui" subtitle={today.length === 0 ? 'Rien de prévu pour aujourd\'hui.' : undefined}>
              {today.map((iv) => (
                <MissionCard key={iv.id} intervention={iv} />
              ))}
            </Section>

            <Section
              title="Cette semaine"
              subtitle={weekUpcoming.length === 0 ? 'Pas de mission prévue dans les 7 prochains jours.' : undefined}
            >
              {weekUpcoming.map((iv) => (
                <CompactRow key={iv.id} intervention={iv} />
              ))}
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ ...typography.h3, color: colors.primary, paddingHorizontal: 4 }}>{title}</Text>
      {subtitle ? (
        <Card padding={16} variant="low" noShadow>
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>{subtitle}</Text>
        </Card>
      ) : (
        children
      )}
    </View>
  );
}

/** Pastille de statut pour une intervention côté agent. */
function interventionBadge(status: InterventionWithSite['status']) {
  switch (status) {
    case 'in_progress':
      return { label: 'EN COURS', variant: 'primary' as const, barColor: colors.primary };
    case 'pending_validation':
      return {
        label: 'EN ATTENTE DE VALIDATION',
        variant: 'warning' as const,
        barColor: colors.warning,
      };
    case 'validated':
      return { label: 'VALIDÉE', variant: 'success' as const, barColor: colors.success };
    case 'rejected':
      return { label: 'REJETÉE', variant: 'error' as const, barColor: colors.error };
    default:
      return null;
  }
}

function MissionCard({ intervention }: { intervention: InterventionWithSite }) {
  const date = new Date(intervention.scheduled_at);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const badge = interventionBadge(intervention.status);
  return (
    <Pressable
      style={styles.missionCard}
      onPress={() => router.push(`/(agent)/mission/${intervention.id}`)}
    >
      <View
        style={[
          styles.accentBar,
          { backgroundColor: badge?.barColor ?? colors.secondary },
        ]}
      />
      <View style={{ flex: 1, paddingLeft: 12 }}>
        <Text style={styles.dayTag}>
          {date
            .toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
            .toUpperCase()}
        </Text>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.onSurface, marginTop: 2 }}>
          {intervention.site?.name ?? 'Site'}
        </Text>
        {intervention.site?.service_type ? (
          <Text style={{ fontSize: 13, color: colors.onSurfaceVariant }}>
            {intervention.site.service_type}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={styles.timeChip}>
          <Text style={{ color: colors.secondary, fontSize: 12, fontWeight: '700' }}>{time}</Text>
        </View>
        {badge ? (
          <Badge label={badge.label} variant={badge.variant} small withDot />
        ) : null}
      </View>
    </Pressable>
  );
}

function CompactRow({ intervention }: { intervention: InterventionWithSite }) {
  const date = new Date(intervention.scheduled_at);
  return (
    <Pressable
      onPress={() => router.push(`/(agent)/mission/${intervention.id}`)}
      style={styles.compactRow}
    >
      <View style={styles.compactDate}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary, letterSpacing: 1.2 }}>
          {date.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase()}
        </Text>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.onSurface }}>
          {date.getDate()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onSurface }} numberOfLines={1}>
          {intervention.site?.name ?? 'Site'}
        </Text>
        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>
          {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      {(() => {
        const badge = interventionBadge(intervention.status);
        return badge ? (
          <Badge label={badge.label} variant={badge.variant} small withDot />
        ) : (
          <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
        );
      })()}
    </Pressable>
  );
}

function IncidentRow({ incident }: { incident: AgentIncident }) {
  const date = new Date(incident.created_at);
  const display = incidentDisplay(incident.status, 'agent');
  return (
    <Pressable
      style={styles.incidentRow}
      onPress={() =>
        router.push({
          pathname: '/(agent)/incident/[id]',
          params: { id: incident.id },
        })
      }
    >
      <View style={styles.incidentBar} />
      <View style={styles.incidentIcon}>
        <MaterialIcons name="warning" size={18} color={colors.error} />
      </View>
      <View style={{ flex: 1, paddingLeft: 4 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '700', color: colors.onSurface }}
          numberOfLines={1}
        >
          {incident.site?.name ?? 'Site'}
          {incident.zone ? ` · ${incident.zone}` : ''}
        </Text>
        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }} numberOfLines={2}>
          {incident.description?.slice(0, 80) ?? 'Signalement sans description'}
        </Text>
        <Text style={{ fontSize: 11, color: colors.outline, marginTop: 4 }}>
          Reçu le{' '}
          {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}{' '}
          ·{' '}
          {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <Badge label={display.label.toUpperCase()} variant={display.variant} small withDot />
    </Pressable>
  );
}

function Kpi({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: keyof typeof MaterialIcons.glyphMap;
}) {
  return (
    <Card style={styles.kpi} padding={16}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.kpiLabel}>{label}</Text>
        <MaterialIcons name={icon} size={18} color={colors.outline} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
    </Card>
  );
}

function KpiHighlight({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: keyof typeof MaterialIcons.glyphMap;
}) {
  return (
    <LinearGradient colors={[colors.primary, colors.primaryContainer]} style={styles.kpiHighlight}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[styles.kpiLabel, { color: 'rgba(255,255,255,0.85)' }]}>{label}</Text>
        <MaterialIcons name={icon} size={18} color="#fff" />
      </View>
      <Text style={[styles.kpiValue, { color: '#fff' }]}>{value}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: 22, fontWeight: '500', color: colors.onSurface },
  firstName: { fontSize: 36, fontWeight: '800', color: colors.primary, letterSpacing: -0.5, lineHeight: 42 },
  role: { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant, letterSpacing: 1.4, marginTop: 4 },

  kpiRow: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, padding: 14 },
  kpiHighlight: {
    flex: 1,
    padding: 16,
    borderRadius: radii.xl,
    shadowColor: '#00236f',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  kpiLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4, color: colors.onSurfaceVariant },
  kpiValue: { fontSize: 30, fontWeight: '800', color: colors.primary, letterSpacing: -0.5, marginTop: 10 },

  loadingBox: { paddingVertical: 28, alignItems: 'center' },

  countPill: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  incidentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    paddingVertical: 12,
    paddingLeft: 18,
    paddingRight: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.20)',
    overflow: 'hidden',
  },
  incidentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.error,
  },
  incidentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(186, 26, 26, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
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

  missionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
    shadowColor: '#181c21',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  dayTag: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: colors.secondary },
  timeChip: {
    backgroundColor: 'rgba(0, 99, 152, 0.10)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },

  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  compactDate: {
    width: 50,
    alignItems: 'center',
  },
});
