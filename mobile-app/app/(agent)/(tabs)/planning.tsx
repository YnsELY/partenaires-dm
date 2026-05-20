import React, { useMemo, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { Header } from '../../../components/Header';
import { Card } from '../../../components/Card';
import { Avatar } from '../../../components/Avatar';
import { Badge } from '../../../components/Badge';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useAgentInterventions, InterventionWithSite } from '../../../hooks/useAgentInterventions';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getMonthGrid(year: number, month: number) {
  // Lundi=0 ... Dimanche=6
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = (firstDay.getDay() + 6) % 7; // décalage pour ISO Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(dayOfWeek).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function AgentPlanning() {
  const { profile } = useAuth();
  const { today, upcoming, past, loading, refresh } = useAgentInterventions();

  const [cursor, setCursor] = useState(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });

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

  const cells = useMemo(() => getMonthGrid(cursor.year, cursor.month), [cursor]);
  const todayDate = new Date();
  const isCurrentMonth =
    cursor.year === todayDate.getFullYear() && cursor.month === todayDate.getMonth();

  // Carte des jours avec interventions ce mois-ci
  const dotsByDay = useMemo(() => {
    const set = new Set<number>();
    const all = [...today, ...upcoming, ...past];
    for (const iv of all) {
      const d = new Date(iv.scheduled_at);
      if (d.getFullYear() === cursor.year && d.getMonth() === cursor.month) {
        set.add(d.getDate());
      }
    }
    return set;
  }, [cursor, today, upcoming, past]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  const upcomingNext = useMemo(() => [...today, ...upcoming].slice(0, 6), [today, upcoming]);
  const finished = useMemo(() => past.slice(0, 6), [past]);

  const isEmpty = !loading && upcomingNext.length === 0 && finished.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Les Partenaires DM"
        leadingAvatar={<Avatar size={32} initials={initials} variant="secondary" />}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingBottom: 120,
          paddingTop: 16,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />}
      >
        <View>
          <Text style={{ ...typography.h2, color: colors.primary }}>Planning de mes interventions</Text>
          <Text style={styles.subtitle}>
            Aperçu de tes missions assignées sur le mois en cours.
          </Text>
        </View>

        <Card padding={20} style={{ overflow: 'hidden' }}>
          <LinearGradient
            colors={[colors.primary, colors.primaryContainer]}
            style={styles.cardTopBar}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ ...typography.h3, color: colors.onSurface, textTransform: 'capitalize' }}>
              {monthLabel}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable
                style={styles.navBtn}
                onPress={() =>
                  setCursor((c) =>
                    c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }
                  )
                }
              >
                <MaterialIcons name="chevron-left" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
              <Pressable
                style={styles.navBtn}
                onPress={() =>
                  setCursor((c) =>
                    c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }
                  )
                }
              >
                <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          </View>

          <View style={styles.weekRow}>
            {DAY_LABELS.map((d) => (
              <Text key={d} style={styles.weekDay}>
                {d.toUpperCase()}
              </Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {cells.map((d, i) => {
              if (d === null) {
                return <View key={`empty-${i}`} style={styles.dayCell} />;
              }
              const isToday = isCurrentMonth && d === todayDate.getDate();
              const hasDot = dotsByDay.has(d);
              return (
                <View key={`d-${i}`} style={[styles.dayCell, isToday && styles.dayCellActive]}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: isToday ? '700' : '400',
                      color: isToday ? '#fff' : colors.onSurface,
                    }}
                  >
                    {d}
                  </Text>
                  {hasDot ? (
                    <View
                      style={[styles.dot, { backgroundColor: isToday ? '#fff' : colors.primary }]}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        </Card>

        {loading && isEmpty ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isEmpty ? (
          <Card padding={28}>
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="event-available" size={42} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Aucune intervention</Text>
              <Text style={styles.emptySub}>
                Tu n'as pas encore de mission assignée. Reviens ici une fois qu'un admin t'aura ajouté
                à un chantier.
              </Text>
            </View>
          </Card>
        ) : (
          <>
            <View style={{ gap: 12 }}>
              <Text style={{ ...typography.h3, color: colors.onSurface, paddingHorizontal: 4 }}>
                À venir
              </Text>
              {upcomingNext.length === 0 ? (
                <Card padding={16} variant="low" noShadow>
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>
                    Aucune mission programmée prochainement.
                  </Text>
                </Card>
              ) : (
                upcomingNext.map((iv) => <UpcomingCard key={iv.id} intervention={iv} />)
              )}
            </View>

            {finished.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Text style={{ ...typography.h3, color: colors.onSurface, paddingHorizontal: 4 }}>
                  Interventions passées
                </Text>
                {finished.map((iv) => (
                  <PastCard key={iv.id} intervention={iv} />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function UpcomingCard({ intervention }: { intervention: InterventionWithSite }) {
  const date = new Date(intervention.scheduled_at);
  const isLive = intervention.status === 'in_progress';
  return (
    <Pressable
      style={styles.upcomingCard}
      onPress={() => router.push(`/(agent)/mission/${intervention.id}`)}
    >
      <View
        style={[styles.accentBar, { backgroundColor: isLive ? colors.primary : colors.secondary }]}
      />
      <View style={{ flex: 1, paddingLeft: 12 }}>
        <Text style={styles.upDate}>
          {date
            .toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
            .toUpperCase()}
        </Text>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.onSurface, marginTop: 2 }}>
          {intervention.site?.name ?? 'Site'}
        </Text>
        {intervention.site?.service_type ? (
          <Text style={{ fontSize: 14, color: colors.onSurfaceVariant }}>
            {intervention.site.service_type}
          </Text>
        ) : null}
      </View>
      <View style={styles.timePill}>
        <Text style={{ color: colors.secondary, fontSize: 11, fontWeight: '700' }}>
          {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </Pressable>
  );
}

function PastCard({ intervention }: { intervention: InterventionWithSite }) {
  const date = new Date(intervention.scheduled_at);
  const variant: 'success' | 'warning' | 'neutral' =
    intervention.status === 'validated' && intervention.global_result === 'ok'
      ? 'success'
      : intervention.status === 'validated' && intervention.global_result === 'to_improve'
      ? 'warning'
      : 'neutral';
  const label =
    intervention.status === 'validated' && intervention.global_result === 'to_improve'
      ? 'À améliorer'
      : intervention.status === 'validated'
      ? 'Validé'
      : intervention.status === 'pending_validation'
      ? 'En attente'
      : 'Rejeté';

  return (
    <Pressable
      onPress={() => router.push(`/(agent)/mission/${intervention.id}`)}
      style={styles.pastCard}
    >
      <View style={styles.pastIcon}>
        <MaterialIcons name="check-circle" size={20} color={colors.onSurfaceVariant} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.upDate}>
          {date
            .toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
            .toUpperCase()}
        </Text>
        <Text
          style={{ fontSize: 15, fontWeight: '500', color: colors.onSurfaceVariant, marginTop: 1 }}
        >
          {intervention.site?.name ?? 'Site'}
        </Text>
      </View>
      <Badge label={label} variant={variant} small />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 4 },
  cardTopBar: {
    height: 4,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: { flexDirection: 'row', marginTop: 16, marginBottom: 8 },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.onSecondaryContainer,
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellActive: {
    backgroundColor: colors.primaryContainer,
    borderRadius: 999,
  },
  dot: { position: 'absolute', bottom: 4, width: 5, height: 5, borderRadius: 3 },

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

  upcomingCard: {
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
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  upDate: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: colors.secondary },
  timePill: {
    backgroundColor: 'rgba(0, 99, 152, 0.10)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surfaceContainerLow,
    padding: 14,
    borderRadius: radii.xl,
    opacity: 0.9,
  },
  pastIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
