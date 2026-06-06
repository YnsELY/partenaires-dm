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

const DAY_LABELS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function getMonthGrid(cursor: Date): Date[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function statusDotColor(status: AdminIntervention['status']): string {
  switch (status) {
    case 'validated':
      return colors.success;
    case 'pending_validation':
      return colors.warning;
    case 'rejected':
      return colors.error;
    case 'in_progress':
    case 'scheduled':
    default:
      return colors.primary;
  }
}

export default function AdminPlanning() {
  const { profile } = useAuth();
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const today = useMemo(() => new Date(), []);

  const cursorMonth = cursor.getMonth();
  const cursorYear = cursor.getFullYear();

  const { items, loading, refresh } = useAdminInterventions({ limit: 500 });

  const initials = useMemo(() => {
    const full = profile?.full_name?.trim() ?? '';
    return (
      full.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || 'A'
    );
  }, [profile?.full_name]);

  const interventionsByDay = useMemo(() => {
    const map = new Map<string, AdminIntervention[]>();
    for (const iv of items) {
      const d = new Date(iv.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(iv);
      map.set(key, list);
    }
    return map;
  }, [items]);

  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const upcoming = useMemo(
    () =>
      items
        .filter((iv) => {
          const d = new Date(iv.scheduled_at);
          return d >= todayMidnight && iv.status !== 'validated' && iv.status !== 'rejected';
        })
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
        .slice(0, 8),
    [items, todayMidnight]
  );

  const past = useMemo(
    () =>
      items
        .filter((iv) => iv.status === 'validated' || iv.status === 'rejected')
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
        .slice(0, 5),
    [items]
  );

  const gridDays = useMemo(() => getMonthGrid(cursor), [cursor]);

  const selectedDayInterventions = useMemo(() => {
    if (!selectedDay) return [];
    return items
      .filter((iv) => sameDay(new Date(iv.scheduled_at), selectedDay))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [items, selectedDay]);

  const monthSubtitle = selectedDay
    ? `Interventions du ${selectedDay.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      })}`
    : `Aperçu des interventions pour ${MONTH_NAMES[cursorMonth]} ${cursorYear}.`;

  const prevMonth = () => {
    setSelectedDay(null);
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setSelectedDay(null);
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  };

  const toggleDay = (d: Date) => {
    if (selectedDay && sameDay(selectedDay, d)) {
      setSelectedDay(null);
    } else {
      setSelectedDay(d);
      if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) {
        setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Les Partenaires DM"
        leadingAvatar={<Avatar size={32} initials={initials} variant="secondary" />}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 16,
          paddingBottom: 140,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <View>
          <Text style={{ ...typography.h2, color: colors.primary }}>Planning</Text>
          <Text style={styles.subtitle}>{monthSubtitle}</Text>
        </View>

        {/* Calendrier mensuel */}
        <Card padding={16} style={{ borderTopWidth: 3, borderTopColor: colors.primary }}>
          <View style={styles.calHeader}>
            <Text style={styles.calMonthLabel}>
              {MONTH_NAMES[cursorMonth]} {cursorYear}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={prevMonth} style={styles.calNavBtn} hitSlop={8}>
                <MaterialIcons name="chevron-left" size={22} color={colors.primary} />
              </Pressable>
              <Pressable onPress={nextMonth} style={styles.calNavBtn} hitSlop={8}>
                <MaterialIcons name="chevron-right" size={22} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.calWeekHeader}>
            {DAY_LABELS.map((d) => (
              <Text key={d} style={styles.calWeekDay}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {gridDays.map((d) => {
              const inMonth = d.getMonth() === cursorMonth;
              const isToday = sameDay(d, today);
              const isSelected = !!selectedDay && sameDay(selectedDay, d);
              const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              const dayIvs = interventionsByDay.get(key) ?? [];
              return (
                <Pressable
                  key={d.toISOString()}
                  style={styles.calCell}
                  onPress={() => toggleDay(d)}
                  hitSlop={2}
                >
                  <View
                    style={[
                      styles.calDayPill,
                      isToday && styles.calDayPillToday,
                      isSelected && styles.calDayPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calDayText,
                        !inMonth && { color: colors.outlineVariant },
                        isToday && { color: '#fff' },
                        isSelected && { color: colors.primary, fontWeight: '800' },
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </View>
                  <View style={styles.calDots}>
                    {dayIvs.length > 0 ? (
                      <View
                        style={[
                          styles.calDot,
                          { backgroundColor: statusDotColor(dayIvs[0].status) },
                        ]}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {selectedDay ? (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {selectedDay
                  .toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
                  .replace(/^./, (c) => c.toUpperCase())}
              </Text>
              <Pressable onPress={() => setSelectedDay(null)} style={styles.clearBtn}>
                <MaterialIcons name="close" size={16} color={colors.primary} />
                <Text style={styles.clearBtnText}>Tout afficher</Text>
              </Pressable>
            </View>
            {loading && selectedDayInterventions.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
            ) : selectedDayInterventions.length === 0 ? (
              <Card padding={20} variant="low" noShadow>
                <Text style={styles.emptyText}>Aucune intervention ce jour-là.</Text>
              </Card>
            ) : (
              <View style={{ gap: 14 }}>
                {selectedDayInterventions.map((iv, i) => (
                  <TimelineItem
                    key={iv.id}
                    intervention={iv}
                    isLast={i === selectedDayInterventions.length - 1}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <>
            <View>
              <Text style={styles.sectionTitle}>À venir</Text>
              {loading && upcoming.length === 0 ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
              ) : upcoming.length === 0 ? (
                <Card padding={20} variant="low" noShadow>
                  <Text style={styles.emptyText}>Aucune intervention à venir.</Text>
                </Card>
              ) : (
                <View style={{ gap: 14 }}>
                  {upcoming.map((iv, i) => (
                    <TimelineItem key={iv.id} intervention={iv} isLast={i === upcoming.length - 1} />
                  ))}
                </View>
              )}
            </View>

            <View>
              <Text style={styles.sectionTitle}>Interventions passées</Text>
              {past.length === 0 ? (
                <Card padding={20} variant="low" noShadow>
                  <Text style={styles.emptyText}>Aucune intervention passée récente.</Text>
                </Card>
              ) : (
                <View style={{ gap: 14 }}>
                  {past.map((iv, i) => (
                    <TimelineItem key={iv.id} intervention={iv} isLast={i === past.length - 1} />
                  ))}
                </View>
              )}
            </View>
          </>
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
  subtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginTop: 4,
    lineHeight: 19,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calMonthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  calNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
  },
  calWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  calWeekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 1,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  calDayPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayPillToday: {
    backgroundColor: colors.primary,
  },
  calDayPillSelected: {
    backgroundColor: 'rgba(0, 35, 111, 0.12)',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  calDayText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
  },
  calDots: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
  },
  calDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.onSurface,
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 35, 111, 0.08)',
  },
  clearBtnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  emptyText: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
  },
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
