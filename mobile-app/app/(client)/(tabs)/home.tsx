import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Avatar } from '../../../components/Avatar';
import { Badge } from '../../../components/Badge';
import { Card } from '../../../components/Card';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { SectionTitle } from '../../../components/SectionTitle';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useClientSites } from '../../../hooks/useClientSites';
import {
  useClientInterventions,
  ClientIntervention,
} from '../../../hooks/useClientInterventions';
import { useClientPhotos } from '../../../hooks/useClientPhotos';
import { useClientIncidents, ClientIncident } from '../../../hooks/useClientIncidents';
import { incidentDisplay } from '../../../lib/incidentStatus';
import { syncClientInterventionReminders } from '../../../lib/notifications';

export default function ClientHome() {
  const { profile } = useAuth();
  const { sites, loading: sitesLoading, refresh: refreshSites } = useClientSites();
  const { items: validated, loading: ivLoading, refresh: refreshIv } = useClientInterventions({
    status: 'validated',
    recent: true,
    limit: 20,
  });
  // Interventions actuellement actives (planifiées ou en cours) — pour les
  // pastilles des cartes "Mes chantiers".
  const { items: activeIv, refresh: refreshActiveIv } = useClientInterventions({
    status: ['scheduled', 'in_progress', 'pending_validation'],
    limit: 100,
  });
  // Signalements actifs (filtre par défaut du hook = tous sauf 'closed')
  const { items: activeIncidents, refresh: refreshIncidents } = useClientIncidents();

  // Planifie un rappel local 1h avant chaque intervention à venir sur les
  // sites du client (miroir du rappel agent).
  useEffect(() => {
    syncClientInterventionReminders(activeIv).catch((e) => {
      console.warn('[notifications] client reminder sync failed', e?.message ?? e);
    });
  }, [activeIv]);

  const lastIntervention = validated[0] ?? null;
  const lastInterventionId = lastIntervention?.id ?? null;
  const { items: lastPhotos } = useClientPhotos({
    interventionId: lastInterventionId ?? undefined,
  });

  const firstName = useMemo(() => {
    const full = profile?.full_name?.trim() ?? '';
    return full.split(' ')[0] || 'Client';
  }, [profile?.full_name]);

  const lastName = useMemo(() => {
    const parts = (profile?.full_name?.trim() ?? '').split(' ');
    return parts.slice(1).join(' ');
  }, [profile?.full_name]);

  const recentHistory = useMemo(() => validated.slice(0, 5), [validated]);
  const loading = sitesLoading || ivLoading;
  const isEmpty = !loading && sites.length === 0 && validated.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Les Partenaires DM"
        leadingAvatar={
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.brandIcon}
            resizeMode="contain"
          />
        }
        rightIcon="person-outline"
        onRightPress={() => router.push('/(client)/compte')}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: responsive.hPadding, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              refreshSites();
              refreshIv();
              refreshActiveIv();
              refreshIncidents();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={{ marginVertical: 24 }}>
          <Text style={styles.greeting}>Bonjour,</Text>
          <Text style={styles.name}>
            {firstName}
            {lastName ? ` ${lastName}` : ''}
          </Text>
        </View>

        {isEmpty ? (
          <Card padding={28}>
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="domain" size={42} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Aucun site rattaché</Text>
              <Text style={styles.emptySub}>
                Vous verrez vos chantiers et rapports d'intervention ici dès que l'équipe des
                Partenaires DM vous aura donné accès à un site.
              </Text>
            </View>
          </Card>
        ) : (
          <>
            <SectionTitle title="Mes chantiers" />
            {sites.length === 0 ? (
              <Card padding={18} variant="low" noShadow>
                <Text style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>
                  Aucun site accessible pour l'instant.
                </Text>
              </Card>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 32 }}>
                <View style={{ flexDirection: 'row', gap: 14, paddingRight: 24 }}>
                  {sites.map((s) => {
                    // On prend l'intervention active la plus récente du site
                    // (par scheduled_at desc). Cela évite qu'une vieille
                    // `in_progress` non-validée masque une nouvelle
                    // `scheduled` qu'on vient de créer.
                    const latest = activeIv
                      .filter((iv) => iv.site_id === s.id)
                      .sort(
                        (a, b) =>
                          new Date(b.scheduled_at).getTime() -
                          new Date(a.scheduled_at).getTime()
                      )[0];

                    const isStarted =
                      latest?.status === 'in_progress' ||
                      latest?.status === 'pending_validation';
                    const isScheduledLate =
                      latest?.status === 'scheduled' &&
                      new Date(latest.scheduled_at).getTime() <= Date.now();
                    const isScheduledFuture =
                      latest?.status === 'scheduled' &&
                      new Date(latest.scheduled_at).getTime() > Date.now();

                    const statusLabel = isStarted
                      ? 'INTERVENTION EN COURS'
                      : isScheduledLate
                      ? 'VA BIENTÔT DÉMARRER'
                      : isScheduledFuture
                      ? 'INTERVENTION PRÉVUE'
                      : undefined;
                    const statusVariant = isStarted ? 'primary' : 'warning';
                    const meta = isStarted
                      ? 'En cours'
                      : isScheduledLate
                      ? `Prévue à ${new Date(latest!.scheduled_at).toLocaleTimeString(
                          'fr-FR',
                          { hour: '2-digit', minute: '2-digit' }
                        )} — en attente de l'agent`
                      : isScheduledFuture
                      ? `${new Date(latest!.scheduled_at).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })} · ${new Date(latest!.scheduled_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : undefined;

                    return (
                      <SiteCard
                        key={s.id}
                        siteName={s.name}
                        description={s.service_type ?? s.description ?? '—'}
                        meta={meta}
                        statusLabel={statusLabel}
                        statusVariant={statusVariant}
                        onPress={() =>
                          router.push({
                            pathname: '/(client)/chantier/[id]',
                            params: { id: s.id },
                          })
                        }
                      />
                    );
                  })}
                </View>
              </ScrollView>
            )}

            <SectionTitle title="Dernière intervention" />
            {lastIntervention ? (
              <Card padding={0} style={{ overflow: 'hidden', marginBottom: 32 }}>
                <View style={styles.heroImage}>
                  {lastPhotos[0]?.url ? (
                    <Image source={{ uri: lastPhotos[0].url }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <MaterialIcons name="image" size={40} color={colors.outline} />
                  )}
                  {lastPhotos.length > 0 ? (
                    <View style={styles.heroBadge}>
                      <MaterialIcons name="photo-camera" size={14} color={colors.onSurface} />
                      <Text style={styles.heroBadgeText}>{lastPhotos.length} photos</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ padding: 20 }}>
                  <View style={styles.lastRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MaterialIcons name="calendar-today" size={14} color={colors.secondary} />
                      <Text style={{ color: colors.secondary, fontSize: 13, fontWeight: '600' }}>
                        {new Date(lastIntervention.validated_at ?? lastIntervention.scheduled_at).toLocaleDateString(
                          'fr-FR',
                          { day: '2-digit', month: 'short', year: 'numeric' }
                        )}
                      </Text>
                    </View>
                    <Badge
                      label={
                        lastIntervention.global_result === 'to_improve'
                          ? 'À AMÉLIORER'
                          : 'CONFORME'
                      }
                      variant={
                        lastIntervention.global_result === 'to_improve' ? 'warning' : 'success'
                      }
                      withDot
                    />
                  </View>
                  <Text style={styles.lastTitle}>{lastIntervention.site?.name ?? '—'}</Text>
                  {lastIntervention.admin_summary ? (
                    <Text style={styles.lastDesc} numberOfLines={4}>
                      {lastIntervention.admin_summary}
                    </Text>
                  ) : (
                    <Text style={[styles.lastDesc, { fontStyle: 'italic' }]}>
                      Pas de résumé fourni par l'équipe des Partenaires DM.
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                    <PrimaryButton
                      label="Voir le rapport"
                      style={{ flex: 1 }}
                      onPress={() =>
                        router.push({
                          pathname: '/(client)/intervention/[id]',
                          params: { id: lastIntervention.id },
                        })
                      }
                    />
                    <PrimaryButton
                      label="Signaler"
                      variant="outline"
                      style={{ flex: 1 }}
                      onPress={() =>
                        router.push({
                          pathname: '/(client)/signalement',
                          params: { site_id: lastIntervention.site_id },
                        })
                      }
                    />
                  </View>
                </View>
              </Card>
            ) : (
              <Card padding={20} variant="low" noShadow style={{ marginBottom: 32 }}>
                <Text style={{ color: colors.onSurfaceVariant, fontSize: 13, textAlign: 'center' }}>
                  Aucune intervention validée pour l'instant. Vos premiers rapports apparaîtront ici.
                </Text>
              </Card>
            )}

            {recentHistory.length > 0 ? (
              <>
                <SectionTitle title="Historique récent" />
                <Card padding={0}>
                  {recentHistory.map((iv, i) => (
                    <React.Fragment key={iv.id}>
                      <HistoryItem intervention={iv} />
                      {i < recentHistory.length - 1 ? <Divider /> : null}
                    </React.Fragment>
                  ))}
                </Card>
              </>
            ) : null}

            {activeIncidents.length > 0 ? (
              <View style={{ marginTop: 32 }}>
                <SectionTitle
                  title="Mes signalements en cours"
                  badge={String(activeIncidents.length)}
                />
                <Card padding={0}>
                  {activeIncidents.map((inc, i) => (
                    <React.Fragment key={inc.id}>
                      <IncidentRow incident={inc} />
                      {i < activeIncidents.length - 1 ? <Divider /> : null}
                    </React.Fragment>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SiteCard({
  siteName,
  description,
  meta,
  statusLabel,
  statusVariant,
  onPress,
}: {
  siteName: string;
  description: string;
  meta?: string;
  statusLabel?: string;
  statusVariant?: 'success' | 'warning' | 'primary';
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.siteCard}>
      {statusLabel ? (
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Badge label={statusLabel} variant={statusVariant ?? 'primary'} small />
        </View>
      ) : null}
      <View style={{ marginTop: statusLabel ? 12 : 0 }}>
        <Text style={{ ...typography.h3, color: colors.onSurface }} numberOfLines={1}>
          {siteName}
        </Text>
        <Text
          style={{ color: colors.onSurfaceVariant, fontSize: 14, marginTop: 4 }}
          numberOfLines={2}
        >
          {description}
        </Text>
      </View>
      {meta ? (
        <View style={styles.siteFooter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="schedule" size={14} color={colors.onSurfaceVariant} />
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>{meta}</Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function IncidentRow({ incident }: { incident: ClientIncident }) {
  const display = incidentDisplay(incident.status, 'client');
  const created = new Date(incident.created_at);
  return (
    <Pressable
      style={styles.histRow}
      onPress={() =>
        router.push({
          pathname: '/(client)/incident/[id]',
          params: { id: incident.id },
        })
      }
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: colors.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}
        >
          {created
            .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
            .toUpperCase()}
        </Text>
        <Text
          style={{ color: colors.onSurface, fontSize: 15, fontWeight: '600', marginTop: 2 }}
          numberOfLines={1}
        >
          {incident.site?.name ?? 'Site'}
          {incident.zone ? ` · ${incident.zone}` : ''}
        </Text>
        {incident.description ? (
          <Text
            style={{ color: colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}
            numberOfLines={1}
          >
            {incident.description}
          </Text>
        ) : null}
      </View>
      <Badge label={display.label.toUpperCase()} variant={display.variant} small />
    </Pressable>
  );
}

function HistoryItem({ intervention }: { intervention: ClientIntervention }) {
  const date = new Date(intervention.validated_at ?? intervention.scheduled_at);
  const variant: 'success' | 'warning' =
    intervention.global_result === 'to_improve' ? 'warning' : 'success';
  const label = intervention.global_result === 'to_improve' ? 'À AMÉLIORER' : 'OK';
  return (
    <Pressable
      style={styles.histRow}
      onPress={() =>
        router.push({
          pathname: '/(client)/intervention/[id]',
          params: { id: intervention.id },
        })
      }
    >
      <View>
        <Text
          style={{ color: colors.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}
        >
          {date
            .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
            .toUpperCase()}
        </Text>
        <Text
          style={{ color: colors.onSurface, fontSize: 15, fontWeight: '600', marginTop: 2 }}
          numberOfLines={1}
        >
          {intervention.site?.name ?? '—'}
        </Text>
      </View>
      <Badge label={label} variant={variant} small />
    </Pressable>
  );
}

function Divider() {
  return (
    <View style={{ height: 1, backgroundColor: colors.surfaceContainerHigh, marginHorizontal: 16 }} />
  );
}

const styles = StyleSheet.create({
  brandIcon: {
    width: 36,
    height: 36,
  },
  greeting: { fontSize: 28, fontWeight: '700', color: colors.onSurface, lineHeight: 34 },
  name: { fontSize: 36, fontWeight: '700', color: colors.primary, lineHeight: 42 },

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

  siteCard: {
    width: 280,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
    shadowColor: '#181c21',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 8,
  },
  siteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
  },
  heroImage: {
    height: 180,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(247, 249, 255, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: colors.onSurface },
  lastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  lastTitle: { fontSize: 17, fontWeight: '700', color: colors.onSurface, marginBottom: 6 },
  lastDesc: { fontSize: 14, color: colors.onSurfaceVariant, lineHeight: 21 },
  histRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
});
