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
import { Header } from '../../../components/Header';
import { Avatar } from '../../../components/Avatar';
import { Card } from '../../../components/Card';
import { Badge } from '../../../components/Badge';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdminInterventions, AdminIntervention } from '../../../hooks/useAdminInterventions';

const FRENCH_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function buildDayWindow(center: Date, span = 7) {
  const days: Date[] = [];
  const start = new Date(center);
  start.setDate(start.getDate() - 2);
  for (let i = 0; i < span; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function AdminPlanning() {
  const { profile } = useAuth();
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const days = useMemo(() => buildDayWindow(selectedDay), [selectedDay]);

  const { items, loading, refresh } = useAdminInterventions({ date: selectedDay });

  const initials = useMemo(() => {
    const full = profile?.full_name?.trim() ?? '';
    return (
      full.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'A'
    );
  }, [profile?.full_name]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.scheduled_at < b.scheduled_at ? -1 : 1)),
    [items]
  );

  const isToday = (d: Date) => d.toDateString() === new Date().toDateString();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Les Partenaires DM"
        leadingAvatar={
          <Pressable>
            <MaterialIcons name="menu" size={26} color={colors.primary} />
          </Pressable>
        }
      />

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
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.5,
              color: colors.onSecondaryContainer,
              marginBottom: 4,
            }}
          >
            {isToday(selectedDay)
              ? "AUJOURD'HUI"
              : selectedDay
                  .toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
                  .toUpperCase()}
          </Text>
          <Text style={{ ...typography.h2, color: colors.primary }}>Planning</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 12, paddingRight: 24 }}>
            {days.map((d, i) => {
              const active = d.toDateString() === selectedDay.toDateString();
              return (
                <Pressable
                  key={i}
                  onPress={() => setSelectedDay(d)}
                  style={[styles.dayPill, active && styles.dayPillActive]}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      { color: active ? '#fff' : colors.onSurfaceVariant },
                    ]}
                  >
                    {FRENCH_DAYS[d.getDay()].toUpperCase()}
                  </Text>
                  <Text style={[styles.dayNum, { color: active ? '#fff' : colors.onSurface }]}>
                    {d.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {loading && sorted.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : sorted.length === 0 ? (
          <Card padding={28}>
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="event-available" size={42} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Aucune intervention ce jour-là</Text>
              <Text style={styles.emptySub}>
                Tu peux en planifier une avec le bouton + en bas à droite.
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 14 }}>
            {sorted.map((iv, i) => (
              <TimelineItem key={iv.id} intervention={iv} isLast={i === sorted.length - 1} />
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/(admin)/intervention-new')}>
        <MaterialIcons name="add" size={26} color="#fff" />
      </Pressable>
    </SafeAreaView>
  );
}

function TimelineItem({
  intervention,
  isLast,
}: {
  intervention: AdminIntervention;
  isLast: boolean;
}) {
  const date = new Date(intervention.scheduled_at);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const isLive = intervention.status === 'in_progress';
  const isPending = intervention.status === 'pending_validation';
  const isValidated = intervention.status === 'validated';
  const isRejected = intervention.status === 'rejected';

  const statusBadge = isLive ? (
    <Badge label="EN COURS" variant="secondary" small withDot />
  ) : isPending ? (
    <Badge label="À VALIDER" variant="warning" small />
  ) : isValidated ? (
    <Badge label="VALIDÉ" variant="success" small />
  ) : isRejected ? (
    <Badge label="REJETÉ" variant="error" small />
  ) : (
    <Badge label="À VENIR" variant="neutral" small />
  );

  return (
    <View style={{ flexDirection: 'row', gap: 16 }}>
      <View style={{ alignItems: 'center', paddingTop: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{time}</Text>
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <Pressable
        style={[styles.timelineCard, isLive && styles.timelineCardLive]}
        onPress={() => {
          if (isPending) router.push(`/(admin)/validation?intervention_id=${intervention.id}`);
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
              {intervention.site?.name ?? 'Site inconnu'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <MaterialIcons name="badge" size={14} color={colors.onSurfaceVariant} />
              <Text style={{ fontSize: 13, color: colors.onSurfaceVariant }}>
                {intervention.agent?.full_name ?? 'Agent non assigné'}
              </Text>
            </View>
          </View>
          {statusBadge}
        </View>
        {intervention.site?.service_type ? (
          <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.surfaceContainerLow }}>
            <Text style={{ fontSize: 12, color: colors.outline }}>
              {intervention.site.service_type}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dayPill: {
    width: 64,
    height: 80,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dayPillActive: {
    backgroundColor: colors.primary,
    shadowColor: '#00236f',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  dayLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  dayNum: { fontSize: 18, fontWeight: '700' },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    marginTop: 10,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii['3xl'],
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.20)',
  },
  timelineCardLive: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    shadowColor: '#00236f',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
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
  fab: {
    position: 'absolute',
    right: responsive.hPadding,
    bottom: 100,
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00236f',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
