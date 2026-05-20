import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Card } from '../../../components/Card';
import { Badge } from '../../../components/Badge';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { supabase, Site, Intervention } from '../../../lib/supabase';

type RecentIntervention = Pick<
  Intervention,
  'id' | 'scheduled_at' | 'status' | 'global_result' | 'team_id'
>;

export default function AgentChantier() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [site, setSite] = useState<Site | null>(null);
  const [recent, setRecent] = useState<RecentIntervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const { data: siteData, error: siteErr } = await supabase
      .from('sites')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (siteErr) {
      setError(siteErr.message);
      setLoading(false);
      return;
    }

    setSite(siteData as Site | null);

    const { data: rec, error: recErr } = await supabase
      .from('interventions')
      .select('id, scheduled_at, status, global_result, team_id')
      .eq('site_id', id)
      .order('scheduled_at', { ascending: false })
      .limit(10);

    if (recErr) {
      setError(recErr.message);
    } else {
      setRecent((rec ?? []) as RecentIntervention[]);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Fiche Chantier" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !site ? (
        <View style={styles.loadingBox}>
          <MaterialIcons name="error-outline" size={36} color={colors.outline} />
          <Text style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
            {error ?? "Chantier introuvable ou non accessible."}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: responsive.hPadding,
            paddingBottom: 120,
            paddingTop: 16,
            gap: 22,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.heroPlaceholder}>
              <MaterialIcons name="apartment" size={72} color="rgba(255,255,255,0.3)" />
            </View>
            <View style={styles.heroOverlay}>
              <Text style={styles.heroTitle}>{site.name}</Text>
            </View>
          </View>

          <Card padding={22}>
            <View style={{ gap: 18 }}>
              <InfoRow icon="location-on" label="ADRESSE" value={site.address ?? '—'} />
              <InfoRow icon="home-repair-service" label="TYPE DE PRESTATION" value={site.service_type ?? '—'} />
            </View>

            {site.description ? (
              <View style={styles.descBox}>
                <Text style={styles.infoLabel}>DESCRIPTION DU SITE</Text>
                <Text style={styles.descText}>{site.description}</Text>
              </View>
            ) : null}
          </Card>

          <View style={{ gap: 14 }}>
            <Text style={{ ...typography.h2, color: colors.primary, paddingHorizontal: 4 }}>
              Interventions récentes
            </Text>

            {recent.length === 0 ? (
              <Card padding={22}>
                <View style={styles.emptyInline}>
                  <MaterialIcons name="event-busy" size={28} color={colors.outline} />
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                    Aucune intervention programmée pour ce site.
                  </Text>
                </View>
              </Card>
            ) : (
              recent.map((r) => {
                const statusVariant: 'success' | 'warning' | 'neutral' | 'primary' =
                  r.status === 'validated' && r.global_result === 'ok'
                    ? 'success'
                    : r.status === 'validated' && r.global_result === 'to_improve'
                    ? 'warning'
                    : r.status === 'pending_validation'
                    ? 'warning'
                    : r.status === 'in_progress'
                    ? 'primary'
                    : 'neutral';
                const statusLabel =
                  r.status === 'validated'
                    ? r.global_result === 'to_improve'
                      ? 'À AMÉLIORER'
                      : 'OK'
                    : r.status === 'pending_validation'
                    ? 'EN ATTENTE'
                    : r.status === 'in_progress'
                    ? 'EN COURS'
                    : r.status === 'rejected'
                    ? 'REJETÉ'
                    : 'PROGRAMMÉE';

                return (
                  <View key={r.id} style={styles.recentRow}>
                    <View style={styles.recentIcon}>
                      <MaterialIcons name="calendar-today" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onSurface }}>
                        {new Date(r.scheduled_at).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 }}>
                        {new Date(r.scheduled_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Badge label={statusLabel} variant={statusVariant} small />
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
      <View style={styles.infoIcon}>
        <MaterialIcons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  hero: {
    height: 200,
    borderRadius: radii['3xl'],
    overflow: 'hidden',
  },
  heroPlaceholder: {
    flex: 1,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 22,
    justifyContent: 'flex-end',
  },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '700' },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: 'rgba(0,35,111,0.6)',
    marginBottom: 2,
  },
  infoValue: { fontSize: 15, fontWeight: '600', color: colors.onSurface, lineHeight: 20 },
  descBox: {
    marginTop: 20,
    padding: 18,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(0, 35, 111, 0.05)',
  },
  descText: { color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 21, marginTop: 6 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
    shadowColor: '#181c21',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  recentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyInline: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
