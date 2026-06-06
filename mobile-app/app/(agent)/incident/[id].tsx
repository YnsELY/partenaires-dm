import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Header } from '../../../components/Header';
import { Card } from '../../../components/Card';
import { Badge } from '../../../components/Badge';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { PhotoViewer, ViewerPhoto } from '../../../components/PhotoViewer';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { supabase, Incident, Site, Profile, Media } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { incidentDisplay } from '../../../lib/incidentStatus';
import { notifyEvent } from '../../../lib/notifications';

type Bundle = Incident & {
  site: Pick<Site, 'id' | 'name' | 'address'> | null;
  reporter: Pick<Profile, 'id' | 'full_name'> | null;
};

export default function AgentIncidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [photos, setPhotos] = useState<Media[]>([]);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resolving, setResolving] = useState(false);
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
        photo_url, status, admin_notes, assigned_agent_id, agent_resolution_notes, created_at,
        site:sites ( id, name, address ),
        reporter:profiles!incidents_reported_by_fkey ( id, full_name )
        `
      )
      .eq('id', id)
      .maybeSingle();

    if (err || !data) {
      setError(err?.message ?? 'Signalement introuvable');
      setLoading(false);
      return;
    }

    const b = data as unknown as Bundle;
    setBundle(b);
    setResolutionNotes(b.agent_resolution_notes ?? '');

    const { data: mediaRows } = await supabase
      .from('media')
      .select('*')
      .eq('incident_id', id)
      .order('taken_at', { ascending: true });
    setPhotos((mediaRows ?? []) as Media[]);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const pickAndUpload = useCallback(async () => {
    if (!bundle || !userId || !id) return;

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && !libPerm.granted) {
      Alert.alert('Permissions', "Autorise l'accès à la caméra ou aux photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];

    try {
      setUploading(true);
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `agent/${userId}/incidents/${id}/${ts}-${rand}.jpg`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: upErr } = await supabase.storage
        .from('media')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from('media')
        .createSignedUrl(path, 60 * 60 * 24 * 60);
      const url = signed?.signedUrl ?? path;

      // Si le signalement est rattaché à une intervention, on lie aussi
      // la photo à l'intervention. Sinon on ne renseigne que incident_id
      // (la colonne intervention_id est nullable depuis la migration 0013).
      const insertPayload: Record<string, unknown> = {
        incident_id: id,
        url,
        type: 'after',
        zone: bundle.zone,
      };
      if (bundle.intervention_id) {
        insertPayload.intervention_id = bundle.intervention_id;
      }
      const { data: inserted, error: insertErr } = await supabase
        .from('media')
        .insert(insertPayload)
        .select()
        .maybeSingle();
      if (insertErr) throw insertErr;

      if (inserted) setPhotos((p) => [...p, inserted as Media]);
    } catch (e: any) {
      Alert.alert('Upload échoué', e?.message ?? 'Erreur inconnue');
    } finally {
      setUploading(false);
    }
  }, [bundle, userId, id]);

  const deletePhoto = useCallback(async (photoId: string) => {
    const { error: delErr } = await supabase.from('media').delete().eq('id', photoId);
    if (delErr) throw new Error(delErr.message);
    setPhotos((p) => p.filter((x) => x.id !== photoId));
  }, []);

  /** Démarre le traitement → status passe à 'in_progress'. */
  const startTreatment = useCallback(async () => {
    if (!bundle) return;
    setResolving(true);
    const { error: err } = await supabase
      .from('incidents')
      .update({ status: 'in_progress' })
      .eq('id', bundle.id);
    setResolving(false);
    if (err) {
      Alert.alert('Erreur', err.message);
      return;
    }
    setBundle((b) => (b ? { ...b, status: 'in_progress' } : b));
  }, [bundle]);

  /** Envoie la résolution pour validation admin → status 'pending_validation'. */
  const submitForValidation = useCallback(async () => {
    if (!bundle) return;
    if (photos.length === 0) {
      Alert.alert(
        'Photos requises',
        "Ajoute au moins une photo de résolution avant d'envoyer pour validation."
      );
      return;
    }
    Alert.alert(
      'Envoyer pour validation',
      "Confirmes-tu avoir terminé le traitement ? L'administrateur va vérifier ton travail.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer',
          style: 'default',
          onPress: async () => {
            setResolving(true);
            const { error: err } = await supabase
              .from('incidents')
              .update({
                status: 'pending_validation',
                agent_resolution_notes: resolutionNotes.trim() || null,
              })
              .eq('id', bundle.id);
            setResolving(false);
            if (err) {
              Alert.alert('Erreur', err.message);
              return;
            }
            notifyEvent('incident_resolution_submitted', bundle.id);
            Alert.alert('Envoyé', "L'admin va valider ton travail.", [
              { text: 'OK', onPress: () => router.back() },
            ]);
          },
        },
      ]
    );
  }, [bundle, photos.length, resolutionNotes]);

  const openViewer = (index: number) => {
    const viewerPhotos: ViewerPhoto[] = photos.map((p) => ({
      id: p.id,
      url: p.url,
      label: 'PHOTO DE RÉSOLUTION',
    }));
    setViewer({ photos: viewerPhotos, initialIndex: index });
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Signalement" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!bundle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Signalement" onBack={() => router.back()} />
        <View style={styles.errorBox}>
          <MaterialIcons name="error-outline" size={36} color={colors.outline} />
          <Text style={{ marginTop: 8, color: colors.onSurfaceVariant, textAlign: 'center' }}>
            {error ?? 'Signalement introuvable ou non assigné.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const created = new Date(bundle.created_at);
  const canUpload = bundle.status === 'in_progress';
  const canStart = bundle.status === 'assigned';
  const canSubmit = bundle.status === 'in_progress';
  const isLocked =
    bundle.status === 'pending_validation' ||
    bundle.status === 'resolved' ||
    bundle.status === 'closed';
  const display = incidentDisplay(bundle.status, 'agent');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Signalement" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 16,
          paddingBottom: 140,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center' }}>
          <Badge label={display.label.toUpperCase()} variant={display.variant} withDot />
        </View>

        <Card padding={22}>
          <Text style={styles.kicker}>SITE</Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '800',
              color: colors.primary,
              marginTop: 4,
            }}
          >
            {bundle.site?.name ?? '—'}
          </Text>
          {bundle.site?.address ? (
            <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 4 }}>
              {bundle.site.address}
            </Text>
          ) : null}

          {bundle.zone ? (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.kicker}>ZONE</Text>
              <Text style={{ fontSize: 15, color: colors.onSurface, marginTop: 4 }}>
                {bundle.zone}
              </Text>
            </View>
          ) : null}

          <View style={styles.detailGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>SIGNALÉ PAR</Text>
              <Text style={styles.detailValue}>
                {bundle.reporter?.full_name ?? '—'}
              </Text>
              <Text style={{ fontSize: 11, color: colors.outline, marginTop: 2 }}>
                {bundle.reporter_role.toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>REÇU LE</Text>
              <Text style={styles.detailValue}>
                {created.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}{' '}
                · {created.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        </Card>

        <Card padding={22}>
          <Text style={styles.kicker}>DESCRIPTION DU PROBLÈME</Text>
          <Text
            style={{
              fontSize: 14,
              color: colors.onSurface,
              marginTop: 8,
              lineHeight: 22,
            }}
          >
            {bundle.description?.trim() || 'Aucune description fournie par le client.'}
          </Text>

          {bundle.photo_url ? (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.kicker}>PHOTO DU CLIENT</Text>
              <Pressable
                style={{ marginTop: 8 }}
                onPress={() =>
                  setViewer({
                    photos: [
                      {
                        id: 'client-photo',
                        url: bundle.photo_url!,
                        label: 'PHOTO DU CLIENT',
                      },
                    ],
                    initialIndex: 0,
                  })
                }
              >
                <Image
                  source={{ uri: bundle.photo_url }}
                  style={styles.clientPhoto}
                  resizeMode="cover"
                />
              </Pressable>
            </View>
          ) : null}

          {bundle.admin_notes ? (
            <View style={styles.adminNotesBox}>
              <Text style={styles.kicker}>NOTES DE L'ADMIN</Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.onSurface,
                  marginTop: 6,
                  lineHeight: 19,
                  fontStyle: 'italic',
                }}
              >
                {bundle.admin_notes}
              </Text>
            </View>
          ) : null}
        </Card>

        <Card padding={22}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name="photo-library" size={20} color={colors.primary} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
              Photos de résolution
            </Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12, color: colors.onSurfaceVariant }}>
              {photos.length}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 }}>
            Téléverse une ou plusieurs photos prouvant la résolution du problème.
          </Text>
          <View style={styles.photosGrid}>
            {photos.map((p, i) => (
              <Pressable key={p.id} style={styles.photoTile} onPress={() => openViewer(i)}>
                <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} />
              </Pressable>
            ))}
            {canUpload ? (
              <Pressable
                onPress={pickAndUpload}
                style={styles.addTile}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <MaterialIcons name="add-a-photo" size={26} color={colors.primary} />
                    <Text style={styles.addLabel}>Ajouter</Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>
          {canStart ? (
            <Text style={styles.lockedHint}>
              Démarre d'abord le traitement pour pouvoir ajouter des photos.
            </Text>
          ) : null}
        </Card>

        <Card padding={22}>
          <Text style={styles.kicker}>NOTES DE RÉSOLUTION (optionnel)</Text>
          <TextInput
            multiline
            value={resolutionNotes}
            onChangeText={setResolutionNotes}
            editable={canUpload}
            placeholder="Décris brièvement ce qui a été fait, les actions correctives prises…"
            placeholderTextColor="rgba(68, 70, 82, 0.5)"
            style={styles.textarea}
          />
        </Card>

        {canStart ? (
          <PrimaryButton
            label={resolving ? 'Démarrage…' : 'Démarrer le traitement'}
            icon="play-arrow"
            size="lg"
            disabled={resolving}
            onPress={startTreatment}
          />
        ) : null}

        {canSubmit ? (
          <PrimaryButton
            label={resolving ? 'Envoi…' : 'Envoyer pour validation'}
            icon="send"
            size="lg"
            disabled={resolving}
            onPress={submitForValidation}
          />
        ) : null}

        {bundle.status === 'pending_validation' ? (
          <View style={styles.waitingBanner}>
            <MaterialIcons name="hourglass-empty" size={20} color={colors.warning} />
            <Text style={styles.waitingBannerText}>
              En attente de validation par l'administrateur.
            </Text>
          </View>
        ) : null}

        {bundle.status === 'resolved' || bundle.status === 'closed' ? (
          <View style={styles.readonlyBanner}>
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', flex: 1 }}>
              Signalement terminé.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <PhotoViewer
        visible={!!viewer}
        photos={viewer?.photos ?? []}
        initialIndex={viewer?.initialIndex ?? 0}
        onClose={() => setViewer(null)}
        onDelete={
          isLocked
            ? undefined
            : async (pid) => {
                if (pid === 'client-photo') return;
                await deletePhoto(pid);
              }
        }
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
  detailGrid: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 18,
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
  },
  detailValue: { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginTop: 4 },
  clientPhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
  },
  adminNotesBox: {
    backgroundColor: colors.surfaceContainerLow,
    padding: 14,
    borderRadius: radii.md,
    marginTop: 16,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  photoTile: {
    width: 90,
    height: 90,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerHigh,
  },
  addTile: {
    width: 90,
    height: 90,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    gap: 4,
  },
  addLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.6,
  },
  lockedHint: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    marginTop: 10,
  },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
  waitingBannerText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  textarea: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 14,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    color: colors.onSurface,
    marginTop: 8,
  },
  readonlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(22, 163, 74, 0.10)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
});
