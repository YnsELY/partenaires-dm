import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Card } from '../../../components/Card';
import { Badge } from '../../../components/Badge';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { PhotoViewer, ViewerPhoto } from '../../../components/PhotoViewer';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { supabase, Incident, Site, Media } from '../../../lib/supabase';
import { incidentDisplay } from '../../../lib/incidentStatus';
import { notifyEvent } from '../../../lib/notifications';

type Bundle = Incident & {
  site: Pick<Site, 'id' | 'name' | 'address'> | null;
};

export default function ClientIncidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [resolutionPhotos, setResolutionPhotos] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [viewer, setViewer] = useState<{
    photos: ViewerPhoto[];
    initialIndex: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('incidents')
      .select(
        `
        id, intervention_id, site_id, reported_by, reporter_role, zone, description,
        photo_url, status, admin_notes, assigned_agent_id, agent_resolution_notes,
        closed_at, created_at,
        site:sites ( id, name, address )
        `
      )
      .eq('id', id)
      .maybeSingle();

    if (err || !data) {
      setError(err?.message ?? 'Signalement introuvable');
      setLoading(false);
      return;
    }

    setBundle(data as unknown as Bundle);

    // Charge les photos de résolution si l'admin a déjà validé.
    const { data: mediaRows } = await supabase
      .from('media')
      .select('*')
      .eq('incident_id', id)
      .order('taken_at', { ascending: true });
    setResolutionPhotos((mediaRows ?? []) as Media[]);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const closeIncident = useCallback(async () => {
    if (!bundle) return;
    Alert.alert(
      'Clôturer le signalement',
      'Confirmez-vous que le problème a bien été résolu ? Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Clôturer',
          style: 'default',
          onPress: async () => {
            setClosing(true);
            const { error: err } = await supabase
              .from('incidents')
              .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
              })
              .eq('id', bundle.id);
            setClosing(false);
            if (err) {
              Alert.alert('Erreur', err.message);
              return;
            }
            notifyEvent('incident_closed', bundle.id);
            Alert.alert('Signalement clôturé', 'Merci pour votre retour.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          },
        },
      ]
    );
  }, [bundle]);

  const reopenSignal = useCallback(() => {
    if (!bundle) return;
    router.replace({
      pathname: '/(client)/signalement',
      params: { site_id: bundle.site_id },
    });
  }, [bundle]);

  const openViewer = (photos: ViewerPhoto[], initialIndex: number) => {
    setViewer({ photos, initialIndex });
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Mon signalement" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!bundle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Mon signalement" onBack={() => router.back()} />
        <View style={styles.errorBox}>
          <MaterialIcons name="error-outline" size={36} color={colors.outline} />
          <Text style={{ marginTop: 8, color: colors.onSurfaceVariant, textAlign: 'center' }}>
            {error ?? 'Ce signalement est introuvable.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const created = new Date(bundle.created_at);
  const display = incidentDisplay(bundle.status, 'client');
  const canClose = bundle.status === 'resolved';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Mon signalement" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 16,
          paddingBottom: 140,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Badge label={display.label.toUpperCase()} variant={display.variant} withDot />
          <Text style={{ ...typography.h3, color: colors.primary, textAlign: 'center' }}>
            {bundle.site?.name ?? 'Site'}
          </Text>
          {bundle.zone ? (
            <Text style={{ fontSize: 13, color: colors.onSurfaceVariant }}>
              Zone : {bundle.zone}
            </Text>
          ) : null}
        </View>

        <Card padding={22}>
          <Text style={styles.kicker}>DESCRIPTION ENVOYÉE</Text>
          <Text style={{ fontSize: 14, color: colors.onSurface, marginTop: 8, lineHeight: 22 }}>
            {bundle.description?.trim() || 'Aucune description.'}
          </Text>

          {bundle.photo_url ? (
            <View style={{ marginTop: 14 }}>
              <Pressable
                onPress={() =>
                  openViewer(
                    [
                      {
                        id: 'client-photo',
                        url: bundle.photo_url!,
                        label: 'PHOTO ENVOYÉE',
                      },
                    ],
                    0
                  )
                }
              >
                <Image
                  source={{ uri: bundle.photo_url }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <MaterialIcons name="schedule" size={14} color={colors.outline} />
            <Text style={styles.metaText}>
              Envoyé le{' '}
              {created.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}{' '}
              à{' '}
              {created.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </Card>

        {/* Card résolution visible uniquement quand l'admin a validé */}
        {bundle.status === 'resolved' || bundle.status === 'closed' ? (
          <Card padding={22}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="check-circle" size={20} color={colors.success} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
                Résolution du problème
              </Text>
            </View>
            {bundle.agent_resolution_notes ? (
              <View style={styles.resolutionNotesBox}>
                <Text style={styles.kicker}>NOTES DE L'AGENT</Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.onSurface,
                    marginTop: 6,
                    lineHeight: 19,
                    fontStyle: 'italic',
                  }}
                >
                  {bundle.agent_resolution_notes}
                </Text>
              </View>
            ) : null}
            {resolutionPhotos.length > 0 ? (
              <>
                <Text style={[styles.kicker, { marginTop: 14 }]}>
                  PHOTOS DE LA RÉSOLUTION ({resolutionPhotos.length})
                </Text>
                <View style={styles.resolutionGrid}>
                  {resolutionPhotos.map((p, i) => (
                    <Pressable
                      key={p.id}
                      style={styles.resolutionTile}
                      onPress={() =>
                        openViewer(
                          resolutionPhotos.map((q) => ({
                            id: q.id,
                            url: q.url,
                            label: 'RÉSOLUTION',
                          })),
                          i
                        )
                      }
                    >
                      <Image
                        source={{ uri: p.url }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Actions selon le statut */}
        {canClose ? (
          <View style={{ gap: 10 }}>
            <PrimaryButton
              label={closing ? 'Clôture en cours…' : 'Tout est OK, clôturer'}
              icon="check-circle"
              size="lg"
              disabled={closing}
              onPress={closeIncident}
            />
            <PrimaryButton
              label="Refaire un signalement"
              icon="refresh"
              variant="outline"
              disabled={closing}
              onPress={reopenSignal}
            />
            <Text style={styles.helperText}>
              Si la résolution vous convient, clôturez le signalement. Sinon, effectuez un nouveau
              signalement en décrivant ce qui n'est pas satisfaisant.
            </Text>
          </View>
        ) : bundle.status === 'closed' ? (
          <View style={styles.finalBanner}>
            <MaterialIcons name="check-circle" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', flex: 1 }}>
              Signalement clôturé. Merci pour votre retour.
            </Text>
          </View>
        ) : (
          <View style={styles.progressBox}>
            <MaterialIcons name="hourglass-empty" size={20} color={colors.primary} />
            <Text style={styles.progressText}>
              {bundle.status === 'open'
                ? "L'équipe des Partenaires DM va prendre en charge votre signalement très bientôt."
                : bundle.status === 'assigned'
                ? "Un intervenant a été désigné, il interviendra dès que possible."
                : "Un intervenant est en train de traiter votre signalement."}
            </Text>
          </View>
        )}
      </ScrollView>

      <PhotoViewer
        visible={!!viewer}
        photos={viewer?.photos ?? []}
        initialIndex={viewer?.initialIndex ?? 0}
        onClose={() => setViewer(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  kicker: { fontSize: 10, fontWeight: '800', color: colors.outline, letterSpacing: 1.4 },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  metaText: { fontSize: 12, color: colors.onSurfaceVariant },
  resolutionNotesBox: {
    backgroundColor: colors.surfaceContainerLow,
    padding: 14,
    borderRadius: radii.md,
    marginTop: 14,
  },
  resolutionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  resolutionTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerHigh,
  },
  helperText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 10,
    marginTop: 4,
  },
  progressBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(0, 35, 111, 0.07)',
    padding: 14,
    borderRadius: radii.lg,
  },
  progressText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 19,
  },
  finalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 35, 111, 0.07)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
});
