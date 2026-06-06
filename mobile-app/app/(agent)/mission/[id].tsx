import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Header } from '../../../components/Header';
import { Card } from '../../../components/Card';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import {
  supabase,
  ChecklistTask,
  ChecklistResult,
  Media,
  Intervention,
  Site,
} from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { formatFrequencyBadge } from '../../../hooks/useCatalog';
import { PhotoViewer, ViewerPhoto } from '../../../components/PhotoViewer';
import { notifyEvent } from '../../../lib/notifications';

type ChecklistResultMap = Record<string, ChecklistResult>; // task_id → result
type MediaByZoneType = Record<string, Media[]>; // `${zone}|${type}` → liste de photos

export default function AgentMission() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [site, setSite] = useState<Pick<Site, 'id' | 'name'> | null>(null);
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [results, setResults] = useState<ChecklistResultMap>({});
  const [media, setMedia] = useState<MediaByZoneType>({});
  const [anomaly, setAnomaly] = useState(false);
  const [anomalyDesc, setAnomalyDesc] = useState('');
  const [agentNotes, setAgentNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{
    photos: ViewerPhoto[];
    initialIndex: number;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const { data: iv, error: ivErr } = await supabase
      .from('interventions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (ivErr || !iv) {
      setError(ivErr?.message ?? 'Intervention introuvable.');
      setLoading(false);
      return;
    }
    setIntervention(iv as Intervention);
    setAgentNotes((iv as Intervention).agent_notes ?? '');

    const { data: siteData } = await supabase
      .from('sites')
      .select('id, name')
      .eq('id', (iv as Intervention).site_id)
      .maybeSingle();
    setSite(siteData as Pick<Site, 'id' | 'name'> | null);

    // Snapshot per-intervention en priorité ; fallback sur le template du site
    // pour les interventions pré-backfill / hors snapshot.
    let { data: taskRows } = await supabase
      .from('checklist_tasks')
      .select('*')
      .eq('intervention_id', id)
      .order('order_index', { ascending: true });
    if (!taskRows || taskRows.length === 0) {
      const fb = await supabase
        .from('checklist_tasks')
        .select('*')
        .eq('site_id', (iv as Intervention).site_id)
        .is('intervention_id', null)
        .order('order_index', { ascending: true });
      taskRows = fb.data ?? [];
    }
    setTasks((taskRows ?? []) as ChecklistTask[]);

    const { data: resultRows } = await supabase
      .from('checklist_results')
      .select('*')
      .eq('intervention_id', id);

    const map: ChecklistResultMap = {};
    for (const r of (resultRows ?? []) as ChecklistResult[]) {
      map[r.task_id] = r;
    }
    setResults(map);

    const { data: mediaRows } = await supabase
      .from('media')
      .select('*')
      .eq('intervention_id', id)
      .order('taken_at', { ascending: true });

    const mm: MediaByZoneType = {};
    for (const m of (mediaRows ?? []) as Media[]) {
      const k = `${m.zone ?? '_'}|${m.type}`;
      (mm[k] ??= []).push(m);
    }
    setMedia(mm);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Groupe les tâches par zone
  const zones = useMemo(() => {
    const z: Record<string, ChecklistTask[]> = {};
    for (const t of tasks) {
      const key = t.zone ?? 'Général';
      (z[key] ??= []).push(t);
    }
    return z;
  }, [tasks]);

  const toggleResult = useCallback(
    async (task: ChecklistTask) => {
      if (!intervention) return;
      const current = results[task.id];
      const nextVal = !(current?.is_done ?? false);

      // Upsert local pour réactivité
      const optimistic: ChecklistResult = {
        id: current?.id ?? `tmp-${task.id}`,
        intervention_id: intervention.id,
        task_id: task.id,
        is_done: nextVal,
        zone: task.zone,
      };
      setResults((s) => ({ ...s, [task.id]: optimistic }));

      const { error: upsertError, data } = await supabase
        .from('checklist_results')
        .upsert(
          {
            id: current?.id,
            intervention_id: intervention.id,
            task_id: task.id,
            is_done: nextVal,
            zone: task.zone,
          },
          { onConflict: 'intervention_id,task_id' }
        )
        .select()
        .maybeSingle();

      if (upsertError) {
        Alert.alert('Erreur', upsertError.message);
        // revert
        setResults((s) => ({ ...s, [task.id]: current ?? optimistic }));
      } else if (data) {
        setResults((s) => ({ ...s, [task.id]: data as ChecklistResult }));
      }
    },
    [intervention, results]
  );

  const pickAndUpload = useCallback(
    async (zone: string, type: 'before' | 'after' | 'anomaly') => {
      if (!intervention || !session?.user?.id) return;
      const key = `${zone}|${type}`;

      const source = await new Promise<'camera' | 'library' | null>((resolve) => {
        Alert.alert(
          'Ajouter une photo',
          'Choisir la source',
          [
            { text: 'Caméra', onPress: () => resolve('camera') },
            { text: 'Galerie', onPress: () => resolve('library') },
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(null) },
          ]
        );
      });
      if (!source) return;

      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission refusée', "Autorise l'accès à la caméra dans les réglages.");
          return;
        }
      } else {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!libPerm.granted) {
          Alert.alert('Permission refusée', "Autorise l'accès à la galerie dans les réglages.");
          return;
        }
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: false,
          });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];

      try {
        setUploadingKey(key);
        const ts = Date.now();
        const rand = Math.random().toString(36).slice(2, 8);
        const safeZone = zone.replace(/[^\w-]+/g, '_').toLowerCase();
        const path = `agent/${session.user.id}/${intervention.id}/${safeZone}/${type}-${ts}-${rand}.jpg`;

        // RN → ArrayBuffer
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();

        const { error: upErr } = await supabase.storage
          .from('media')
          .upload(path, arrayBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (upErr) throw upErr;

        const { data: signed } = await supabase.storage
          .from('media')
          .createSignedUrl(path, 60 * 60 * 24 * 60); // 60 jours

        const url = signed?.signedUrl ?? path;

        const { data: inserted, error: insertErr } = await supabase
          .from('media')
          .insert({
            intervention_id: intervention.id,
            url,
            type,
            zone,
          })
          .select()
          .maybeSingle();

        if (insertErr) throw insertErr;

        setMedia((s) => ({
          ...s,
          [key]: [...(s[key] ?? []), inserted as Media],
        }));
      } catch (e: any) {
        Alert.alert('Upload échoué', e?.message ?? 'Erreur inconnue');
      } finally {
        setUploadingKey(null);
      }
    },
    [intervention, session?.user?.id]
  );

  const deletePhoto = useCallback(async (photoId: string) => {
    const { error: delErr } = await supabase.from('media').delete().eq('id', photoId);
    if (delErr) throw new Error(delErr.message);
    setMedia((s) => {
      const next: MediaByZoneType = {};
      for (const [k, list] of Object.entries(s)) {
        next[k] = list.filter((m) => m.id !== photoId);
      }
      return next;
    });
  }, []);

  const startIntervention = useCallback(async () => {
    if (!intervention) return;
    setStarting(true);
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from('interventions')
      .update({ status: 'in_progress', started_at: now })
      .eq('id', intervention.id);
    setStarting(false);
    if (upErr) {
      Alert.alert('Erreur', upErr.message);
      return;
    }
    setIntervention((iv) => (iv ? { ...iv, status: 'in_progress', started_at: now } : iv));
    notifyEvent('intervention_started', intervention.id);
  }, [intervention]);

  const openViewer = useCallback((photos: Media[], initialIndex: number) => {
    const viewerPhotos: ViewerPhoto[] = photos.map((p) => ({
      id: p.id,
      url: p.url,
      label: `${p.type.toUpperCase()} · ${p.zone ?? 'Général'}`,
    }));
    setViewer({ photos: viewerPhotos, initialIndex });
  }, []);

  const saveNotes = useCallback(async () => {
    if (!intervention) return;
    await supabase.from('interventions').update({ agent_notes: agentNotes }).eq('id', intervention.id);
  }, [intervention, agentNotes]);

  const submit = useCallback(async () => {
    if (!intervention) return;
    setSubmitting(true);
    try {
      // Sauvegarde notes d'abord
      await saveNotes();

      // Anomalie en option : crée un incident si toggled
      if (anomaly && anomalyDesc.trim()) {
        const { data: incident } = await supabase
          .from('incidents')
          .insert({
          intervention_id: intervention.id,
          site_id: intervention.site_id,
          reported_by: session?.user?.id,
          reporter_role: 'agent',
          description: anomalyDesc.trim(),
          status: 'open',
          })
          .select('id')
          .maybeSingle();
        if (incident?.id) notifyEvent('incident_created', incident.id);
      }

      const { data, error: fnError } = await supabase.functions.invoke('submit-intervention', {
        body: { intervention_id: intervention.id },
      });
      if (fnError) throw fnError;
      if (data?.error) {
        const missing = (data.missing as { zone: string; type: string }[] | undefined) ?? [];
        const missingTxt =
          missing.length > 0
            ? '\n\nManquant : ' +
              missing.map((m) => `• ${m.zone === '_global' ? 'global' : m.zone} (${m.type})`).join('\n')
            : '';
        throw new Error((data.error as string) + missingTxt);
      }

      Alert.alert('Intervention soumise', 'Ton rapport est en attente de validation par l\'admin.', [
        { text: 'OK', onPress: () => router.replace('/(agent)/(tabs)/home') },
      ]);
    } catch (e: any) {
      Alert.alert('Soumission impossible', e?.message ?? 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }, [intervention, anomaly, anomalyDesc, saveNotes, session?.user?.id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.loading]} edges={['top']}>
        <Header title="Mission" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!intervention) {
    return (
      <SafeAreaView style={[styles.loading]} edges={['top']}>
        <Header title="Mission" onBack={() => router.back()} />
        <View style={styles.emptyState}>
          <MaterialIcons name="error-outline" size={36} color={colors.outline} />
          <Text style={{ marginTop: 8, color: colors.onSurfaceVariant, textAlign: 'center' }}>
            {error ?? "Mission introuvable ou non accessible."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const zoneEntries = Object.entries(zones);
  const isReadOnly =
    intervention.status === 'pending_validation' ||
    intervention.status === 'validated' ||
    intervention.status === 'rejected';
  const isScheduled = intervention.status === 'scheduled';
  const scheduledDate = new Date(intervention.scheduled_at);

  // Avant démarrage : on affiche un écran d'attente avec le bouton Démarrer.
  if (isScheduled) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Ma mission" onBack={() => router.back()} />
        <View style={styles.startWrap}>
          <View style={styles.startIcon}>
            <MaterialIcons name="schedule" size={48} color={colors.primary} />
          </View>
          <Text style={{ ...typography.h2, color: colors.primary, textAlign: 'center' }}>
            {site?.name ?? 'Mission'}
          </Text>
          <Text style={styles.startSub}>
            Intervention planifiée le{' '}
            {scheduledDate.toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}{' '}
            à{' '}
            {scheduledDate.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </Text>
          <Text style={styles.startHint}>
            Quand tu arrives sur site, démarre l'intervention pour ouvrir la checklist et le
            module photos.
          </Text>
          <PrimaryButton
            label={starting ? 'Démarrage...' : "Démarrer l'intervention"}
            icon="play-arrow"
            size="lg"
            onPress={startIntervention}
            disabled={starting}
            style={{ alignSelf: 'stretch', marginTop: 12 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Ma mission" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 18,
          paddingBottom: 140,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ ...typography.h2, color: colors.primary, textAlign: 'center' }}>
            Ma mission — {site?.name ?? '...'}
          </Text>
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 14, textAlign: 'center' }}>
            Documente chaque zone et signale toute anomalie.
          </Text>
          {intervention.status === 'in_progress' && intervention.started_at ? (
            <View style={styles.statusBanner}>
              <MaterialIcons name="play-circle-outline" size={16} color={colors.success} />
              <Text style={styles.statusBannerText}>
                En cours depuis{' '}
                {new Date(intervention.started_at).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          ) : null}
        </View>

        {zoneEntries.length === 0 ? (
          <Card padding={26}>
            <View style={styles.emptyInline}>
              <MaterialIcons name="checklist" size={36} color={colors.outline} />
              <Text style={styles.emptyTitle}>Aucune tâche configurée</Text>
              <Text style={styles.emptySub}>
                L'admin n'a pas encore défini de checklist pour ce chantier. Tu peux quand même
                ajouter une note interne et soumettre l'intervention.
              </Text>
            </View>
          </Card>
        ) : (
          zoneEntries.map(([zone, zoneTasks]) => (
            <Card padding={22} key={zone}>
              <Text style={styles.zoneTitle}>{zone}</Text>

              <View style={{ marginBottom: 18, gap: 14 }}>
                <PhotosGrid
                  label="AVANT"
                  variant="before"
                  photos={media[`${zone}|before`] ?? []}
                  uploading={uploadingKey === `${zone}|before`}
                  disabled={isReadOnly}
                  onAdd={() => pickAndUpload(zone, 'before')}
                  onOpen={(idx) => openViewer(media[`${zone}|before`] ?? [], idx)}
                />
                <PhotosGrid
                  label="APRÈS"
                  variant="after"
                  photos={media[`${zone}|after`] ?? []}
                  uploading={uploadingKey === `${zone}|after`}
                  disabled={isReadOnly}
                  onAdd={() => pickAndUpload(zone, 'after')}
                  onOpen={(idx) => openViewer(media[`${zone}|after`] ?? [], idx)}
                />
              </View>

              <View style={{ gap: 10 }}>
                {zoneTasks.map((t) => {
                  const r = results[t.id];
                  const done = r?.is_done ?? false;
                  const badge = formatFrequencyBadge(t.frequency, t.frequency_count);
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => !isReadOnly && toggleResult(t)}
                      style={[styles.checkRow, done && { backgroundColor: colors.surfaceContainerLow }]}
                    >
                      <MaterialIcons
                        name={done ? 'check-box' : 'check-box-outline-blank'}
                        size={22}
                        color={colors.primary}
                      />
                      <Text
                        style={{
                          fontSize: 15,
                          color: colors.onSurface,
                          flex: 1,
                          textDecorationLine: done ? 'line-through' : 'none',
                          opacity: done ? 0.6 : 1,
                        }}
                      >
                        {t.label}
                      </Text>
                      {badge ? (
                        <View style={styles.freqBadge}>
                          <Text style={styles.freqBadgeText}>{badge}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          ))
        )}

        <Card padding={22}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 1,
              borderBottomColor: colors.surfaceContainerHigh,
              paddingBottom: 14,
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="warning" size={22} color={colors.error} />
              <Text style={{ ...typography.h3, color: colors.onSurface }}>Signalement d'anomalie</Text>
            </View>
            <Switch
              value={anomaly}
              onValueChange={setAnomaly}
              disabled={isReadOnly}
              trackColor={{ true: colors.primary, false: colors.surfaceContainerHighest }}
              thumbColor="#fff"
            />
          </View>

          {anomaly ? (
            <View style={{ gap: 18 }}>
              <View>
                <Text style={styles.smallLabel}>DESCRIPTION DE L'ANOMALIE</Text>
                <TextInput
                  multiline
                  editable={!isReadOnly}
                  placeholder="Détaillez le problème rencontré..."
                  placeholderTextColor="rgba(68, 70, 82, 0.5)"
                  value={anomalyDesc}
                  onChangeText={setAnomalyDesc}
                  style={styles.textarea}
                />
              </View>
            </View>
          ) : null}
        </Card>

        <Card padding={22}>
          <Text style={styles.smallLabel}>NOTE INTERNE (visible admin uniquement)</Text>
          <TextInput
            multiline
            editable={!isReadOnly}
            placeholder="Notes pour l'admin (non transmis au client)"
            placeholderTextColor="rgba(68, 70, 82, 0.5)"
            value={agentNotes}
            onChangeText={setAgentNotes}
            onBlur={saveNotes}
            style={styles.textarea}
          />
        </Card>

        {isReadOnly ? (
          <View style={styles.readonlyBanner}>
            <MaterialIcons name="lock-outline" size={18} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
              Cette intervention est en {intervention.status === 'pending_validation'
                ? 'attente de validation'
                : intervention.status === 'validated'
                ? 'statut validé'
                : 'statut rejeté'}.
            </Text>
          </View>
        ) : (
          <PrimaryButton
            label={submitting ? 'Envoi...' : "Soumettre l'intervention"}
            size="lg"
            icon="send"
            onPress={submit}
            disabled={submitting}
          />
        )}
      </ScrollView>

      <PhotoViewer
        visible={!!viewer}
        photos={viewer?.photos ?? []}
        initialIndex={viewer?.initialIndex ?? 0}
        onClose={() => setViewer(null)}
        onDelete={isReadOnly ? undefined : deletePhoto}
      />
    </SafeAreaView>
  );
}

function PhotosGrid({
  label,
  variant,
  photos,
  uploading,
  disabled,
  onAdd,
  onOpen,
}: {
  label: string;
  variant: 'before' | 'after';
  photos: Media[];
  uploading: boolean;
  disabled?: boolean;
  onAdd: () => void;
  onOpen: (index: number) => void;
}) {
  const labelStyle =
    variant === 'after'
      ? { backgroundColor: colors.primary, color: '#fff' }
      : { backgroundColor: colors.error, color: '#fff' };
  return (
    <View>
      <View style={[styles.photosHeader, { backgroundColor: labelStyle.backgroundColor }]}>
        <Text style={{ color: labelStyle.color, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 }}>
          {label}
        </Text>
        <Text style={{ color: labelStyle.color, fontSize: 11, fontWeight: '700' }}>
          {photos.length}
        </Text>
      </View>
      <View style={styles.photosGrid}>
        {photos.map((p, i) => (
          <Pressable key={p.id} style={styles.photoThumb} onPress={() => onOpen(i)}>
            <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} />
          </Pressable>
        ))}
        {!disabled ? (
          <Pressable onPress={onAdd} style={styles.photoAddTile} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <MaterialIcons name="add-a-photo" size={26} color={colors.primary} />
                <Text style={styles.photoAddLabel}>Ajouter</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.background },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  zoneTitle: {
    ...typography.h3,
    color: colors.onSurface,
    paddingBottom: 14,
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  photosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
  },
  photoThumb: {
    width: 90,
    height: 90,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerHigh,
  },
  photoAddTile: {
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
  photoAddLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.6,
  },
  startWrap: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 80,
    alignItems: 'center',
    gap: 14,
  },
  startIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  startSub: {
    fontSize: 15,
    color: colors.onSurface,
    textAlign: 'center',
    lineHeight: 22,
  },
  startHint: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 320,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(22, 163, 74, 0.10)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 8,
  },
  statusBannerText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radii.md,
  },
  freqBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surfaceContainerHigh,
  },
  freqBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.4,
  },
  smallLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.onSecondaryContainer,
    marginBottom: 8,
  },
  textarea: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 14,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
    color: colors.onSurface,
  },
  emptyInline: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
    marginTop: 6,
    textAlign: 'center',
  },
  emptySub: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  readonlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 35, 111, 0.07)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
});
