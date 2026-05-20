import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Card } from '../../../components/Card';
import { Badge } from '../../../components/Badge';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { supabase, Site, Client, Intervention, Profile } from '../../../lib/supabase';

type SiteWithClient = Site & { client: Pick<Client, 'id' | 'name' | 'logo_url'> | null };
type InterventionWithAgent = Intervention & {
  agent: Pick<Profile, 'id' | 'full_name'> | null;
};

export default function ClientChantierDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const siteId = id ?? null;

  const [site, setSite] = useState<SiteWithClient | null>(null);
  const [interventions, setInterventions] = useState<InterventionWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);

    const [siteRes, ivRes] = await Promise.all([
      supabase
        .from('sites')
        .select('*, client:clients ( id, name, logo_url )')
        .eq('id', siteId)
        .maybeSingle(),
      supabase
        .from('interventions')
        .select('*, agent:profiles!interventions_agent_id_fkey ( id, full_name )')
        .eq('site_id', siteId)
        .order('scheduled_at', { ascending: false })
        .limit(10),
    ]);

    if (siteRes.error) {
      setError(siteRes.error.message);
      setLoading(false);
      return;
    }
    setSite((siteRes.data as unknown as SiteWithClient) ?? null);

    if (ivRes.error) {
      setError(ivRes.error.message);
    } else {
      setInterventions((ivRes.data ?? []) as unknown as InterventionWithAgent[]);
    }
    setLoading(false);
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  const responsibleAgentName = useMemo(() => {
    // Premier nom d'agent trouvé sur les interventions récentes.
    for (const iv of interventions) {
      if (iv.agent?.full_name) return iv.agent.full_name;
    }
    return null;
  }, [interventions]);

  if (loading && !site) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Fiche Chantier" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!site) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Fiche Chantier" onBack={() => router.back()} />
        <View style={styles.errorWrap}>
          <MaterialIcons name="error-outline" size={36} color={colors.outline} />
          <Text style={styles.errorTitle}>Chantier introuvable</Text>
          <Text style={styles.errorSub}>
            {error ?? "Ce site n'existe plus ou tu n'y as pas accès."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Fiche Chantier" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 16,
          paddingBottom: 140,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          {site.photo_url ? (
            <Image source={{ uri: site.photo_url }} style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.heroFallback]}>
              <MaterialIcons name="domain" size={64} color={colors.outline} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(24,28,33,0.7)']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroIconBtn}>
            <MaterialIcons name="photo-camera" size={18} color="#fff" />
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {site.name}
          </Text>
        </View>

        {/* Infos */}
        <Card padding={0}>
          <InfoRow icon="location-on" label="ADRESSE" value={site.address ?? '—'} />
          <Divider />
          <InfoRow
            icon="business"
            label="CLIENT"
            value={site.client?.name ?? '—'}
          />
          <Divider />
          <InfoRow
            icon="person"
            label="AGENT RESPONSABLE"
            value={responsibleAgentName ?? 'Non assigné'}
          />
          <Divider />
          <InfoRow
            icon="home-repair-service"
            label="TYPE DE PRESTATION"
            value={site.service_type ?? '—'}
          />

          {site.description ? (
            <View style={styles.descriptionBox}>
              <Text style={styles.descriptionLabel}>DESCRIPTION DU SITE</Text>
              <Text style={styles.descriptionText}>{site.description}</Text>
            </View>
          ) : null}
        </Card>

        {/* Interventions récentes */}
        <View>
          <Text style={styles.sectionTitle}>Interventions récentes</Text>
          {interventions.length === 0 ? (
            <Card padding={20} variant="low" noShadow>
              <Text
                style={{ color: colors.onSurfaceVariant, fontSize: 13, textAlign: 'center' }}
              >
                Aucune intervention pour ce chantier pour l'instant.
              </Text>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              {interventions.slice(0, 5).map((iv) => (
                <InterventionRow key={iv.id} intervention={iv} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <MaterialIcons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function InterventionRow({ intervention }: { intervention: InterventionWithAgent }) {
  const date = new Date(intervention.scheduled_at);
  const isMorning = date.getHours() < 14;
  const label = isMorning ? 'Intervention matinale' : 'Intervention soir';

  const variant: 'success' | 'warning' | 'primary' =
    intervention.status === 'validated' && intervention.global_result === 'to_improve'
      ? 'warning'
      : intervention.status === 'validated'
      ? 'success'
      : 'primary';
  const badgeLabel =
    intervention.status === 'validated' && intervention.global_result === 'to_improve'
      ? 'À AMÉLIORER'
      : intervention.status === 'validated'
      ? 'OK'
      : intervention.status === 'pending_validation'
      ? 'EN ATTENTE'
      : intervention.status === 'rejected'
      ? 'REJETÉ'
      : 'PLANIFIÉ';

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/(client)/intervention/[id]',
          params: { id: intervention.id },
        })
      }
      style={styles.intRow}
    >
      <View style={styles.intIcon}>
        <MaterialIcons name="calendar-today" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.intDate}>
          {date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </Text>
        <Text style={styles.intSub} numberOfLines={1}>
          {label}
          {intervention.agent?.full_name ? ` - ${intervention.agent.full_name}` : ''}
        </Text>
      </View>
      <Badge label={badgeLabel} variant={variant} small withDot />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 200,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'flex-end',
    padding: 18,
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  heroIconBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLow,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: colors.onSecondaryContainer,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
  },
  divider: {
    height: 1,
    backgroundColor: colors.surfaceContainerHigh,
    marginHorizontal: 18,
  },
  descriptionBox: {
    backgroundColor: colors.surfaceContainerLow,
    margin: 14,
    padding: 14,
    borderRadius: radii.md,
  },
  descriptionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: colors.onSecondaryContainer,
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: 10,
  },
  intRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  intIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
  },
  intDate: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  intSub: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onSurface,
    textAlign: 'center',
  },
  errorSub: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
});
