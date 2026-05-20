import React, { useEffect, useMemo, useState } from 'react';
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
import { Header } from '../../../components/Header';
import { Card } from '../../../components/Card';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useClientInterventions, ClientIntervention } from '../../../hooks/useClientInterventions';
import { useClientPhotos } from '../../../hooks/useClientPhotos';
import { useClientEvaluation } from '../../../hooks/useClientEvaluation';
import { PhotoViewer, ViewerPhoto } from '../../../components/PhotoViewer';
import { supabase, ChecklistTask, ChecklistResult } from '../../../lib/supabase';
import { openUrl } from '../../../lib/openUrl';

export default function ClientInterventionDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const interventionId = params.id ?? null;

  // On pioche dans la liste complète (validées ou non) pour pouvoir afficher
  // un détail même sur une intervention pas encore validée (au cas où).
  const { items, loading: listLoading } = useClientInterventions({
    recent: true,
    limit: 200,
  });
  const intervention: ClientIntervention | null = useMemo(
    () => items.find((i) => i.id === interventionId) ?? null,
    [items, interventionId]
  );

  const { items: photos, loading: photosLoading } = useClientPhotos({
    interventionId: interventionId ?? undefined,
  });

  const { evaluation, save, saving } = useClientEvaluation(interventionId);

  const [stars, setStars] = useState(0);
  const [satisfied, setSatisfied] = useState<'satisfied' | 'to_improve' | null>(null);
  const [comment, setComment] = useState('');
  const [viewer, setViewer] = useState<{
    photos: ViewerPhoto[];
    initialIndex: number;
  } | null>(null);
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [taskResults, setTaskResults] = useState<Record<string, ChecklistResult>>({});

  useEffect(() => {
    if (!interventionId) return;
    let cancelled = false;
    (async () => {
      // Snapshot per-intervention en priorité ; fallback sur le template du site
      // si l'intervention est antérieure au backfill.
      let tasksRes = await supabase
        .from('checklist_tasks')
        .select('*')
        .eq('intervention_id', interventionId)
        .order('order_index', { ascending: true });
      if (!tasksRes.data || tasksRes.data.length === 0) {
        // On a besoin du site_id pour le fallback — on attend que `intervention`
        // soit chargé via useClientInterventions.
        return;
      }
      const resultsRes = await supabase
        .from('checklist_results')
        .select('*')
        .eq('intervention_id', interventionId);
      if (cancelled) return;
      setTasks((tasksRes.data ?? []) as ChecklistTask[]);
      const map: Record<string, ChecklistResult> = {};
      for (const r of (resultsRes.data ?? []) as ChecklistResult[]) {
        map[r.task_id] = r;
      }
      setTaskResults(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [interventionId]);

  const tasksByZone = useMemo(() => {
    const m = new Map<string, ChecklistTask[]>();
    for (const t of tasks) {
      const k = t.zone ?? 'Général';
      const list = m.get(k) ?? [];
      list.push(t);
      m.set(k, list);
    }
    return Array.from(m.entries()).map(([zone, items]) => ({ zone, items }));
  }, [tasks]);

  useEffect(() => {
    if (evaluation) {
      setStars(evaluation.rating ?? 0);
      setSatisfied(evaluation.satisfaction);
      setComment(evaluation.comment ?? '');
    } else {
      setStars(0);
      setSatisfied(null);
      setComment('');
    }
  }, [evaluation]);

  const date = intervention
    ? new Date(intervention.validated_at ?? intervention.scheduled_at)
    : null;

  const openPdf = async () => {
    if (!intervention?.pdf_url) {
      Alert.alert(
        'Rapport non disponible',
        "Le rapport PDF n'a pas encore été généré par l'administrateur."
      );
      return;
    }
    try {
      await openUrl(intervention.pdf_url);
    } catch (e: any) {
      Alert.alert('Lien indisponible', e?.message ?? 'Le PDF est temporairement inaccessible.');
    }
  };

  const onSubmitEval = async () => {
    if (!intervention) return;
    if (stars === 0 && !satisfied) {
      Alert.alert('Avis incomplet', 'Note ou ressenti requis.');
      return;
    }
    try {
      await save({ rating: stars || null, satisfaction: satisfied, comment });
      Alert.alert('Avis envoyé', 'Merci pour ton retour.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Impossible d'envoyer l'avis");
    }
  };

  const loading = listLoading || photosLoading;

  if (loading && !intervention) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Mon intervention" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!intervention) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Mon intervention" onBack={() => router.back()} />
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <MaterialIcons name="description" size={42} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Intervention introuvable</Text>
          <Text style={styles.emptySub}>
            Cette intervention n'existe plus ou tu n'y as pas accès.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title={
          date
            ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
            : 'Intervention'
        }
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingBottom: 140,
          paddingTop: 16,
          gap: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Résumé */}
        <Card style={{ overflow: 'hidden' }}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.cardWatermarkLogo}
            resizeMode="contain"
          />
          <Text style={{ ...typography.h3, color: colors.onSurface, marginBottom: 14 }}>
            Résumé de l'intervention
          </Text>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View>
              <Text style={styles.minorLabel}>STATUT GLOBAL</Text>
              <View
                style={[
                  styles.statusPill,
                  intervention.global_result === 'to_improve'
                    ? { backgroundColor: 'rgba(245, 158, 11, 0.16)' }
                    : null,
                ]}
              >
                <MaterialIcons
                  name={intervention.global_result === 'to_improve' ? 'warning' : 'check-circle'}
                  size={16}
                  color={
                    intervention.global_result === 'to_improve' ? '#b45309' : colors.secondary
                  }
                />
                <Text
                  style={{
                    color:
                      intervention.global_result === 'to_improve' ? '#92400e' : colors.secondary,
                    fontSize: 13,
                    fontWeight: '700',
                  }}
                >
                  {intervention.global_result === 'to_improve'
                    ? 'À améliorer'
                    : 'Intervention OK'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.summaryBox}>
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 22 }}>
              {intervention.admin_summary?.trim() ||
                "L'administrateur n'a pas fourni de résumé pour cette intervention."}
            </Text>
          </View>
        </Card>

        <PrimaryButton
          label={intervention.pdf_url ? 'Voir le rapport PDF' : 'Rapport non disponible'}
          icon="picture-as-pdf"
          size="lg"
          variant="outline"
          disabled={!intervention.pdf_url}
          onPress={openPdf}
        />

        {/* Tâches effectuées */}
        {tasks.length > 0 ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <MaterialIcons name="checklist" size={22} color={colors.primary} />
              <Text style={{ ...typography.h2, color: colors.primary }}>Tâches effectuées</Text>
            </View>
            <Card padding={18}>
              {tasksByZone.map((zg, zi) => {
                const total = zg.items.length;
                const done = zg.items.filter((t) => taskResults[t.id]?.is_done).length;
                return (
                  <View
                    key={zg.zone}
                    style={[styles.zoneBlock, zi > 0 && styles.zoneBlockBorder]}
                  >
                    <View style={styles.zoneHeader}>
                      <Text style={styles.zoneHeaderName}>{zg.zone}</Text>
                      <Text style={styles.zoneHeaderCount}>
                        {done}/{total}
                      </Text>
                    </View>
                    {zg.items.map((t) => {
                      const isDone = taskResults[t.id]?.is_done ?? false;
                      return (
                        <View key={t.id} style={styles.taskLine}>
                          <MaterialIcons
                            name={isDone ? 'check-circle' : 'cancel'}
                            size={18}
                            color={isDone ? colors.success : colors.outline}
                          />
                          <Text
                            style={{
                              fontSize: 13,
                              color: isDone ? colors.onSurface : colors.onSurfaceVariant,
                              flex: 1,
                              textDecorationLine: isDone ? 'none' : 'line-through',
                            }}
                          >
                            {t.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </Card>
          </View>
        ) : null}

        {/* Photos */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <MaterialIcons name="photo-library" size={22} color={colors.primary} />
            <Text style={{ ...typography.h2, color: colors.primary }}>Photos validées</Text>
          </View>
          {photos.length === 0 ? (
            <Card padding={20} variant="low" noShadow>
              <Text style={{ color: colors.onSurfaceVariant, fontSize: 13, textAlign: 'center' }}>
                Aucune photo validée pour cette intervention.
              </Text>
            </Card>
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((p, idx) => (
                <Pressable
                  key={p.id}
                  style={styles.photoTile}
                  onPress={() => {
                    const viewerPhotos: ViewerPhoto[] = photos.map((q) => ({
                      id: q.id,
                      url: q.url,
                      label: `${q.type.toUpperCase()} · ${q.zone ?? 'Général'}`,
                    }));
                    setViewer({ photos: viewerPhotos, initialIndex: idx });
                  }}
                >
                  <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} />
                  {p.zone ? (
                    <View style={styles.photoTileLabel}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.onSurface }}>
                        {p.zone}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <PrimaryButton
          variant="danger"
          icon="report"
          label="Signaler un problème"
          onPress={() =>
            router.push({
              pathname: '/(client)/signalement',
              params: { site_id: intervention.site_id },
            })
          }
        />

        {/* Évaluation */}
        <Card>
          <Text style={{ ...typography.h2, color: colors.primary, marginBottom: 6 }}>
            Votre évaluation
          </Text>
          {evaluation ? (
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 12, marginBottom: 14 }}>
              Tu peux modifier ton avis à tout moment.
            </Text>
          ) : null}
          <View style={styles.starsRow}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Pressable key={i} onPress={() => setStars(i + 1)}>
                <MaterialIcons
                  name={i < stars ? 'star' : 'star-border'}
                  size={36}
                  color={i < stars ? colors.secondaryContainer : colors.outline}
                />
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
            <Pressable
              style={[styles.toggleBtn, satisfied === 'satisfied' && styles.toggleBtnActive]}
              onPress={() => setSatisfied('satisfied')}
            >
              <Text
                style={[
                  styles.toggleBtnText,
                  satisfied === 'satisfied' && { color: colors.primary },
                ]}
              >
                Satisfait
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, satisfied === 'to_improve' && styles.toggleBtnActive]}
              onPress={() => setSatisfied('to_improve')}
            >
              <Text
                style={[
                  styles.toggleBtnText,
                  satisfied === 'to_improve' && { color: colors.primary },
                ]}
              >
                À améliorer
              </Text>
            </Pressable>
          </View>

          <TextInput
            multiline
            placeholder="Commentaire optionnel..."
            placeholderTextColor={colors.outline}
            style={styles.textArea}
            value={comment}
            onChangeText={setComment}
            maxLength={500}
          />

          <PrimaryButton
            label={saving ? 'Envoi...' : evaluation ? 'Modifier mon avis' : 'Envoyer mon avis'}
            disabled={saving}
            onPress={onSubmitEval}
          />
        </Card>
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
  zoneBlock: {
    paddingVertical: 10,
    gap: 4,
  },
  zoneBlockBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
    marginTop: 4,
  },
  zoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  zoneHeaderName: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.onSecondaryContainer,
    textTransform: 'uppercase',
  },
  zoneHeaderCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  taskLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  cardWatermarkLogo: {
    position: 'absolute',
    right: -20,
    bottom: -30,
    width: 180,
    height: 180,
    opacity: 0.06,
  },
  minorLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.onSurfaceVariant,
    marginBottom: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 99, 152, 0.10)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pdfBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  summaryBox: {
    marginTop: 18,
    backgroundColor: colors.surfaceContainerLow,
    padding: 16,
    borderRadius: radii.lg,
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoTile: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoTileLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(247, 249, 255, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(0, 35, 111, 0.08)',
    borderColor: colors.primary,
  },
  toggleBtnText: { color: colors.onSurfaceVariant, fontSize: 14, fontWeight: '600' },
  textArea: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 14,
    fontSize: 14,
    color: colors.onSurface,
    minHeight: 96,
    textAlignVertical: 'top',
    marginVertical: 18,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  emptySub: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
});
