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
import { Card } from '../../../components/Card';
import { Avatar } from '../../../components/Avatar';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import {
  useClientInterventions,
  ClientIntervention,
} from '../../../hooks/useClientInterventions';

const DAY_LABELS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

/**
 * Retourne les 42 dates (6 semaines × 7 jours, lundi en tête) qui couvrent
 * complètement le mois pointé par `cursor`.
 */
function getMonthGrid(cursor: Date): Date[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  // getDay() = 0 (dim) à 6 (sam) — on veut lundi en tête.
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

function statusDotColor(status: ClientIntervention['status']): string {
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

export default function ClientPlanning() {
  const { profile } = useAuth();
  const { items, loading, refresh } = useClientInterventions({
    recent: true,
    limit: 200,
  });

  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const today = useMemo(() => new Date(), []);
  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const initials = useMemo(
    () =>
      (profile?.full_name ?? '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join('') || '?',
    [profile?.full_name]
  );

  // Map yyyy-mm-dd → liste d'interventions du jour (pour les dots du calendrier).
  const interventionsByDay = useMemo(() => {
    const map = new Map<string, ClientIntervention[]>();
    for (const iv of items) {
      const d = new Date(iv.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(iv);
      map.set(key, list);
    }
    return map;
  }, [items]);

  const upcoming = useMemo(
    () =>
      items
        .filter((iv) => {
          const d = new Date(iv.scheduled_at);
          return d >= todayMidnight && iv.status !== 'validated' && iv.status !== 'rejected';
        })
        .sort(
          (a, b) =>
            new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        )
        .slice(0, 5),
    [items, todayMidnight]
  );

  const past = useMemo(
    () =>
      items
        .filter((iv) => iv.status === 'validated' || iv.status === 'rejected')
        .sort(
          (a, b) =>
            new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
        )
        .slice(0, 5),
    [items]
  );

  const gridDays = useMemo(() => getMonthGrid(cursor), [cursor]);
  const cursorMonth = cursor.getMonth();
  const cursorYear = cursor.getFullYear();

  // Interventions du jour sélectionné (triées chronologiquement)
  const selectedDayInterventions = useMemo(() => {
    if (!selectedDay) return [];
    return items
      .filter((iv) => sameDay(new Date(iv.scheduled_at), selectedDay))
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
  }, [items, selectedDay]);

  const monthSubtitle = selectedDay
    ? `Interventions du ${selectedDay.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      })}`
    : `Aperçu de vos missions pour le mois de ${MONTH_NAMES[cursorMonth]}.`;

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
      // Si on tape une case d'un mois adjacent, on aligne le calendrier.
      if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) {
        setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    }
  };

  const openIntervention = (id: string) =>
    router.push({ pathname: '/(client)/intervention/[id]', params: { id } });

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
          <Text style={{ ...typography.h2, color: colors.primary }}>
            Planning de mes interventions
          </Text>
          <Text style={styles.subtitle}>{monthSubtitle}</Text>
        </View>

        {/* Calendrier */}
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
          /* Vue filtrée par jour */
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {selectedDay
                  .toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                  })
                  .replace(/^./, (c) => c.toUpperCase())}
              </Text>
              <Pressable onPress={() => setSelectedDay(null)} style={styles.clearBtn}>
                <MaterialIcons name="close" size={16} color={colors.primary} />
                <Text style={styles.clearBtnText}>Tout afficher</Text>
              </Pressable>
            </View>
            {selectedDayInterventions.length === 0 ? (
              <Card padding={20} variant="low" noShadow>
                <Text style={styles.emptyText}>Aucune intervention ce jour-là.</Text>
              </Card>
            ) : (
              <View style={{ gap: 10 }}>
                {selectedDayInterventions.map((iv) => {
                  const isPast =
                    iv.status === 'validated' || iv.status === 'rejected';
                  return isPast ? (
                    <PastRow
                      key={iv.id}
                      intervention={iv}
                      onPress={openIntervention}
                    />
                  ) : (
                    <UpcomingRow
                      key={iv.id}
                      intervention={iv}
                      onPress={openIntervention}
                    />
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          <>
            {/* À venir */}
            <View>
              <Text style={styles.sectionTitle}>À venir (Aujourd'hui)</Text>
              {loading && upcoming.length === 0 ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
              ) : upcoming.length === 0 ? (
                <Card padding={20} variant="low" noShadow>
                  <Text style={styles.emptyText}>
                    Aucune intervention à venir pour l'instant.
                  </Text>
                </Card>
              ) : (
                <View style={{ gap: 10 }}>
                  {upcoming.map((iv) => (
                    <UpcomingRow key={iv.id} intervention={iv} onPress={openIntervention} />
                  ))}
                </View>
              )}
            </View>

            {/* Passées */}
            <View>
              <Text style={styles.sectionTitle}>Interventions passées</Text>
              {past.length === 0 ? (
                <Card padding={20} variant="low" noShadow>
                  <Text style={styles.emptyText}>Pas encore d'historique d'interventions.</Text>
                </Card>
              ) : (
                <View style={{ gap: 10 }}>
                  {past.map((iv) => (
                    <PastRow key={iv.id} intervention={iv} onPress={openIntervention} />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDayChip(iso: string): string {
  const d = new Date(iso);
  const label = d
    .toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase()
    .replace('.', '');
  return label;
}

function formatTimeRange(iso: string): string {
  // On n'a pas de durée explicite — on affiche juste l'heure de début.
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function UpcomingRow({
  intervention,
  onPress,
}: {
  intervention: ClientIntervention;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable onPress={() => onPress(intervention.id)} style={styles.upcomingRow}>
      <View style={styles.upcomingBar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.upcomingChip}>{formatDayChip(intervention.scheduled_at)}</Text>
        <Text style={styles.upcomingTitle} numberOfLines={1}>
          {intervention.site?.name ?? 'Chantier'}
        </Text>
        {intervention.site?.service_type ? (
          <Text style={styles.upcomingSub} numberOfLines={1}>
            {intervention.site.service_type}
          </Text>
        ) : null}
      </View>
      <View style={styles.timeChip}>
        <Text style={styles.timeChipText}>{formatTimeRange(intervention.scheduled_at)}</Text>
      </View>
    </Pressable>
  );
}

function PastRow({
  intervention,
  onPress,
}: {
  intervention: ClientIntervention;
  onPress: (id: string) => void;
}) {
  const date = new Date(intervention.validated_at ?? intervention.scheduled_at);
  return (
    <Pressable onPress={() => onPress(intervention.id)} style={styles.pastRow}>
      <View style={styles.pastCheck}>
        <MaterialIcons name="check-circle" size={20} color={colors.outline} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pastDate}>
          {date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase().replace('.', '')}
        </Text>
        <Text style={styles.pastTitle} numberOfLines={1}>
          {intervention.site?.name ?? 'Chantier'}
        </Text>
      </View>
      <Text style={styles.pastBadge}>
        {intervention.status === 'rejected' ? 'Rejeté' : 'Terminé'}
      </Text>
    </Pressable>
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
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingLeft: 18,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
    overflow: 'hidden',
  },
  upcomingBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.primary,
  },
  upcomingChip: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  upcomingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
  },
  upcomingSub: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  timeChip: {
    backgroundColor: 'rgba(100, 186, 254, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.md,
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSecondaryContainer,
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLow,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
  },
  pastCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastDate: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 1.2,
  },
  pastTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
    marginTop: 2,
  },
  pastBadge: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
});
