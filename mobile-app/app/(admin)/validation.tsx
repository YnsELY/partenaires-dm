import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { Badge, BadgeVariant } from '../../components/Badge';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, radii, responsive, typography } from '../../constants/theme';
import {
  supabase,
  Intervention,
  Site,
  Profile,
  Media,
  ChecklistTask,
  ChecklistResult,
  Evaluation,
} from '../../lib/supabase';
import { PhotoViewer, ViewerPhoto } from '../../components/PhotoViewer';
import { openUrl } from '../../lib/openUrl';

type Bundle = {
  intervention: Intervention;
  site: Pick<Site, 'id' | 'name' | 'address' | 'service_type'> | null;
  agent: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
  tasks: ChecklistTask[];
  results: Record<string, ChecklistResult>;
  media: Media[];
  evaluations: Array<
    Evaluation & {
      client: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
    }
  >;
};

export default function AdminValidation() {
  const params = useLocalSearchParams<{ intervention_id?: string }>();
  const interventionId = params.intervention_id ?? '';

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminSummary, setAdminSummary] = useState('');
  const [adminDetails, setAdminDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultModal, setResultModal] = useState(false);
  const [pendingResult, setPendingResult] = useState<'ok' | 'to_improve' | null>(null);
  const [emailConfirmModal, setEmailConfirmModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [viewer, setViewer] = useState<{
    photos: ViewerPhoto[];
    initialIndex: number;
  } | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const load = useCallback(async () => {
    if (!interventionId) {
      setError('Identifiant manquant');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data: iv, error: ivErr } = await supabase
      .from('interventions')
      .select(
        `
        id, site_id, agent_id, team_id, scheduled_at, started_at, submitted_at,
        validated_at, status, agent_notes, admin_summary, admin_details, admin_notes,
        global_result, pdf_url, created_at,
        site:sites ( id, name, address, service_type ),
        agent:profiles!interventions_agent_id_fkey ( id, full_name, email )
        `
      )
      .eq('id', interventionId)
      .maybeSingle();

    if (ivErr || !iv) {
      setError(ivErr?.message ?? 'Intervention introuvable');
      setLoading(false);
      return;
    }

    const intervention = iv as unknown as Intervention & {
      site: Bundle['site'];
      agent: Bundle['agent'];
    };

    // Snapshot per-intervention en priorité ; fallback sur le template du site.
    let tasksRes = await supabase
      .from('checklist_tasks')
      .select('*')
      .eq('intervention_id', interventionId)
      .order('order_index', { ascending: true });
    if (!tasksRes.data || tasksRes.data.length === 0) {
      tasksRes = await supabase
        .from('checklist_tasks')
        .select('*')
        .eq('site_id', intervention.site_id)
        .is('intervention_id', null)
        .order('order_index', { ascending: true });
    }
    const [{ data: results }, { data: media }, { data: evaluations }] = await Promise.all([
      supabase.from('checklist_results').select('*').eq('intervention_id', interventionId),
      supabase
        .from('media')
        .select('*')
        .eq('intervention_id', interventionId)
        .order('taken_at', { ascending: true }),
      supabase
        .from('evaluations')
        .select(
          `
          id, intervention_id, client_profile_id, rating, satisfaction, comment,
          created_at, updated_at,
          client:profiles!evaluations_client_profile_id_fkey ( id, full_name, email )
          `
        )
        .eq('intervention_id', interventionId)
        .order('updated_at', { ascending: false }),
    ]);
    const tasks = tasksRes.data;

    const map: Record<string, ChecklistResult> = {};
    for (const r of (results ?? []) as ChecklistResult[]) map[r.task_id] = r;

    const mediaList = (media ?? []) as Media[];

    setBundle({
      intervention,
      site: intervention.site,
      agent: intervention.agent,
      tasks: (tasks ?? []) as ChecklistTask[],
      results: map,
      media: mediaList,
      evaluations: ((evaluations ?? []) as unknown) as Bundle['evaluations'],
    });
    setAdminSummary(intervention.admin_summary ?? '');
    setAdminDetails(intervention.admin_details ?? '');
    setLoading(false);
  }, [interventionId]);

  useEffect(() => {
    load();
  }, [load]);

  const tasksByZone = useMemo(() => {
    if (!bundle) return [] as { zone: string; tasks: ChecklistTask[] }[];
    const m: Record<string, ChecklistTask[]> = {};
    for (const t of bundle.tasks) {
      const k = t.zone ?? 'Général';
      (m[k] ??= []).push(t);
    }
    return Object.entries(m).map(([zone, tasks]) => ({ zone, tasks }));
  }, [bundle]);

  const checklistStats = useMemo(() => {
    if (!bundle) return { done: 0, total: 0 };
    const total = bundle.tasks.length;
    const done = bundle.tasks.filter((t) => bundle.results[t.id]?.is_done).length;
    return { done, total };
  }, [bundle]);

  const mediaByZone = useMemo(() => {
    if (!bundle) return [] as { zone: string; items: Media[] }[];
    const m: Record<string, Media[]> = {};
    for (const ph of bundle.media) {
      const k = ph.zone ?? 'Général';
      (m[k] ??= []).push(ph);
    }
    return Object.entries(m).map(([zone, items]) => ({ zone, items }));
  }, [bundle]);

  const onValidate = async (global_result: 'ok' | 'to_improve') => {
    if (!bundle) return;
    setSubmitting(true);
    const { data, error: fnErr } = await supabase.functions.invoke('validate-intervention', {
      body: {
        intervention_id: bundle.intervention.id,
        action: 'validate',
        admin_summary: adminSummary,
        admin_details: adminDetails,
        global_result,
      },
    });
    setSubmitting(false);
    setResultModal(false);
    setPendingResult(null);

    if (fnErr || (data as any)?.error) {
      Alert.alert(
        'Validation impossible',
        (data as any)?.error ?? fnErr?.message ?? 'Erreur inconnue'
      );
      return;
    }

    Alert.alert('Intervention validée', 'Le client peut désormais consulter le rapport. Un email avec le rapport PDF lui sera envoyé automatiquement.', [
      { text: 'OK', onPress: () => router.replace('/(admin)/(tabs)/home') },
    ]);
  };

  const downloadPdf = async () => {
    if (!bundle) return;
    setGeneratingPdf(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-report', {
        body: { intervention_id: bundle.intervention.id },
      });
      if (fnErr) {
        let detail: string | null = null;
        try {
          const ctx = (fnErr as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            detail = body?.error ?? null;
          }
        } catch {
          /* ignore */
        }
        throw new Error(detail ?? fnErr.message ?? 'Erreur inconnue');
      }
      if ((data as any)?.error) {
        throw new Error((data as any).error);
      }
      const url = (data as any)?.signed_url;
      if (!url) throw new Error("URL du PDF manquante dans la réponse.");
      await openUrl(url);
    } catch (e: any) {
      Alert.alert('Téléchargement impossible', e?.message ?? 'Erreur inconnue');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const onReject = async () => {
    if (!bundle) return;
    if (!rejectReason.trim()) {
      Alert.alert('Champ requis', 'Indique une raison pour le rejet.');
      return;
    }
    setSubmitting(true);
    const { data, error: fnErr } = await supabase.functions.invoke('validate-intervention', {
      body: {
        intervention_id: bundle.intervention.id,
        action: 'reject',
        reason: rejectReason.trim(),
      },
    });
    setSubmitting(false);
    setRejectModal(false);

    if (fnErr || (data as any)?.error) {
      Alert.alert(
        'Rejet impossible',
        (data as any)?.error ?? fnErr?.message ?? 'Erreur inconnue'
      );
      return;
    }

    Alert.alert('Intervention rejetée', "L'agent peut consulter la raison.", [
      { text: 'OK', onPress: () => router.replace('/(admin)/(tabs)/home') },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Validation Intervention" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!bundle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <Header title="Validation Intervention" onBack={() => router.back()} />
        <View style={styles.errorBox}>
          <MaterialIcons name="error-outline" size={36} color={colors.outline} />
          <Text style={{ marginTop: 8, color: colors.onSurfaceVariant, textAlign: 'center' }}>
            {error ?? 'Intervention introuvable.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { intervention, site, agent } = bundle;
  const isFinal = intervention.status === 'validated' || intervention.status === 'rejected';
  const statusBadgeVariant: BadgeVariant =
    intervention.status === 'validated' && intervention.global_result === 'to_improve'
      ? 'warning'
      : intervention.status === 'validated'
      ? 'success'
      : intervention.status === 'rejected'
      ? 'error'
      : 'warning';
  const statusBadgeLabel =
    intervention.status === 'validated' && intervention.global_result === 'to_improve'
      ? 'VALIDÉ — À AMÉLIORER'
      : intervention.status === 'validated'
      ? 'VALIDÉ'
      : intervention.status === 'rejected'
      ? 'REJETÉ'
      : intervention.status === 'pending_validation'
      ? 'EN ATTENTE DE VALIDATION'
      : intervention.status.toUpperCase();

  const date = new Date(intervention.scheduled_at);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Validation Intervention"
        onBack={() => router.back()}
        leadingAvatar={
          <Avatar
            size={32}
            initials={(agent?.full_name ?? 'A')
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((s) => s[0]?.toUpperCase())
              .join('')}
          />
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 18,
          paddingBottom: 200,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center' }}>
          <Badge label={statusBadgeLabel} variant={statusBadgeVariant} />
        </View>

        <Card padding={22}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>SITE CLIENT</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary, marginTop: 4 }}>
                {site?.name ?? '—'}
              </Text>
              {site?.address ? (
                <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 4 }}>
                  {site.address}
                </Text>
              ) : null}
            </View>
            <View style={styles.iconBubble}>
              <MaterialIcons name="domain" size={22} color={colors.primary} />
            </View>
          </View>

          <View style={styles.detailGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>AGENT RESPONSABLE</Text>
              <Text style={styles.detailValue}>{agent?.full_name ?? '—'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>DATE & HEURE</Text>
              <Text style={styles.detailValue}>
                {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                • {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        </Card>

        <View>
          <Text style={{ ...typography.h2, color: colors.primary, paddingHorizontal: 4, marginBottom: 12 }}>
            Révision du contrôle
          </Text>

          <Card padding={22} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <View
                style={[
                  styles.successIcon,
                  checklistStats.done < checklistStats.total && {
                    backgroundColor: 'rgba(245, 158, 11, 0.10)',
                  },
                ]}
              >
                <MaterialIcons
                  name="task-alt"
                  size={28}
                  color={
                    checklistStats.done === checklistStats.total && checklistStats.total > 0
                      ? '#16a34a'
                      : colors.warning
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
                  Checklist
                </Text>
                <Text style={{ fontSize: 13, color: colors.onSurfaceVariant }}>
                  {checklistStats.total === 0
                    ? 'Aucune tâche définie'
                    : checklistStats.done === checklistStats.total
                    ? 'Toutes les tâches cochées'
                    : `${checklistStats.total - checklistStats.done} tâche(s) non terminée(s)`}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '800',
                  color:
                    checklistStats.done === checklistStats.total && checklistStats.total > 0
                      ? '#16a34a'
                      : colors.warning,
                }}
              >
                {checklistStats.done}/{checklistStats.total}
              </Text>
            </View>

            {tasksByZone.length > 0 ? (
              <View style={{ marginTop: 18, gap: 14 }}>
                {tasksByZone.map((zg) => (
                  <View key={zg.zone}>
                    <Text style={styles.kicker}>{zg.zone.toUpperCase()}</Text>
                    {zg.tasks.map((t) => {
                      const done = bundle.results[t.id]?.is_done ?? false;
                      return (
                        <View key={t.id} style={styles.taskLine}>
                          <MaterialIcons
                            name={done ? 'check-box' : 'check-box-outline-blank'}
                            size={20}
                            color={done ? '#16a34a' : colors.outline}
                          />
                          <Text
                            style={{
                              fontSize: 14,
                              color: done ? colors.onSurface : colors.onSurfaceVariant,
                              flex: 1,
                              opacity: done ? 1 : 0.85,
                            }}
                          >
                            {t.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          <Card padding={22}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <MaterialIcons name="photo-library" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
                Preuves photographiques
              </Text>
              <Text style={{ marginLeft: 'auto', fontSize: 12, color: colors.onSurfaceVariant }}>
                {bundle.media.length} photo{bundle.media.length > 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 14 }}>
              Tap pour agrandir. Toutes les photos seront visibles par le client après validation.
            </Text>

            {bundle.media.length === 0 ? (
              <Text
                style={{
                  color: colors.onSurfaceVariant,
                  fontSize: 13,
                  paddingVertical: 12,
                  textAlign: 'center',
                }}
              >
                Aucune photo soumise par l'agent.
              </Text>
            ) : (
              <View style={{ gap: 16 }}>
                {mediaByZone.map((mg) => (
                  <View key={mg.zone} style={{ gap: 10 }}>
                    <Text style={styles.kicker}>{mg.zone.toUpperCase()}</Text>
                    <View style={styles.photoGrid}>
                      {mg.items.map((m, idx) => (
                        <Pressable
                          key={m.id}
                          onPress={() => {
                            const viewerPhotos: ViewerPhoto[] = mg.items.map((p) => ({
                              id: p.id,
                              url: p.url,
                              label: `${p.type.toUpperCase()} · ${mg.zone}`,
                            }));
                            setViewer({ photos: viewerPhotos, initialIndex: idx });
                          }}
                          style={styles.photoTile}
                        >
                          <Image source={{ uri: m.url }} style={styles.photoImg} resizeMode="cover" />
                          <View
                            style={[
                              styles.photoBadge,
                              {
                                backgroundColor:
                                  m.type === 'before'
                                    ? 'rgba(186, 26, 26, 0.85)'
                                    : m.type === 'after'
                                    ? 'rgba(0, 35, 111, 0.85)'
                                    : 'rgba(245, 158, 11, 0.92)',
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: '#fff',
                                fontSize: 9,
                                fontWeight: '700',
                                letterSpacing: 1.4,
                              }}
                            >
                              {m.type.toUpperCase()}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </View>

        {intervention.agent_notes ? (
          <Card padding={22}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MaterialIcons name="comment" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
                Notes de l'agent
              </Text>
            </View>
            <View style={styles.notesBox}>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.onSurfaceVariant,
                  lineHeight: 22,
                  fontStyle: 'italic',
                }}
              >
                « {intervention.agent_notes} »
              </Text>
            </View>
          </Card>
        ) : null}

        {bundle.evaluations.length > 0 ? (
          <Card padding={22}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MaterialIcons name="star" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
                Avis client
              </Text>
              <Text style={{ marginLeft: 'auto', fontSize: 12, color: colors.onSurfaceVariant }}>
                {bundle.evaluations.length}
              </Text>
            </View>
            <View style={{ gap: 12 }}>
              {bundle.evaluations.map((ev) => (
                <View key={ev.id} style={styles.evaluationBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onSurface, flex: 1 }}>
                      {ev.client?.full_name ?? ev.client?.email ?? 'Client'}
                    </Text>
                    {ev.rating ? (
                      <Text style={styles.ratingText}>{ev.rating}/5</Text>
                    ) : null}
                  </View>
                  {ev.satisfaction ? (
                    <Badge
                      label={ev.satisfaction === 'to_improve' ? 'À AMÉLIORER' : 'SATISFAIT'}
                      variant={ev.satisfaction === 'to_improve' ? 'warning' : 'success'}
                      small
                    />
                  ) : null}
                  {ev.comment ? (
                    <Text style={styles.evaluationComment}>{ev.comment}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card padding={22}>
          <Text style={styles.kicker}>RÉSUMÉ POUR LE CLIENT</Text>
          <TextInput
            multiline
            editable={!isFinal}
            placeholder="Décris l'intervention en quelques phrases (visible côté client)..."
            placeholderTextColor="rgba(68, 70, 82, 0.5)"
            value={adminSummary}
            onChangeText={setAdminSummary}
            style={styles.textarea}
          />
        </Card>

        <Card padding={22}>
          <Text style={styles.kicker}>DÉTAILS À AJOUTER</Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.onSurfaceVariant,
              marginTop: 4,
              lineHeight: 18,
            }}
          >
            Précisions complémentaires sur l'intervention (contexte, points
            d'attention, recommandations). Ces détails apparaîtront dans le PDF
            envoyé au client, en plus du résumé.
          </Text>
          <TextInput
            multiline
            editable={!isFinal}
            placeholder="Ex: zones traitées en priorité, produits utilisés, recommandations..."
            placeholderTextColor="rgba(68, 70, 82, 0.5)"
            value={adminDetails}
            onChangeText={setAdminDetails}
            style={[styles.textarea, { minHeight: 140 }]}
          />
        </Card>

        {intervention.status === 'rejected' && intervention.admin_notes ? (
          <Card padding={22} variant="low" noShadow>
            <Text style={styles.kicker}>RAISON DU REJET</Text>
            <Text style={{ fontSize: 14, color: colors.onSurface, marginTop: 6, lineHeight: 22 }}>
              {intervention.admin_notes}
            </Text>
          </Card>
        ) : null}

        {!isFinal ? (
          <View style={{ gap: 10 }}>
            <PrimaryButton
              label="Valider et envoyer au client"
              icon="send"
              size="lg"
              disabled={submitting}
              onPress={() => setResultModal(true)}
            />
            <PrimaryButton
              label="Rejeter l'intervention"
              variant="outline"
              icon="block"
              disabled={submitting}
              onPress={() => setRejectModal(true)}
            />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View style={styles.finalBanner}>
              <MaterialIcons name="check-circle" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', flex: 1 }}>
                Intervention {intervention.status === 'validated' ? 'validée' : 'rejetée'} le{' '}
                {new Date(intervention.validated_at ?? intervention.submitted_at ?? '').toLocaleDateString(
                  'fr-FR',
                  { day: '2-digit', month: 'short', year: 'numeric' }
                )}
                .
              </Text>
            </View>
            {intervention.status === 'validated' ? (
              <PrimaryButton
                label={generatingPdf ? 'Génération en cours…' : 'Télécharger le rapport PDF'}
                icon="picture-as-pdf"
                size="lg"
                disabled={generatingPdf}
                onPress={downloadPdf}
              />
            ) : null}
          </View>
        )}
      </ScrollView>

      <PhotoViewer
        visible={!!viewer}
        photos={viewer?.photos ?? []}
        initialIndex={viewer?.initialIndex ?? 0}
        onClose={() => setViewer(null)}
      />

      {/* Modal résultat */}
      <Modal visible={resultModal} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setResultModal(false)}>
          <Pressable style={styles.modalBox} onPress={() => {}}>
            <Text style={styles.modalTitle}>Résultat global</Text>
            <Text style={styles.modalSub}>
              Comment qualifies-tu globalement cette intervention ?
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Pressable
                style={[styles.resultBtn, { backgroundColor: 'rgba(22, 163, 74, 0.10)' }]}
                onPress={() => {
                  setResultModal(false);
                  setPendingResult('ok');
                  setEmailConfirmModal(true);
                }}
                disabled={submitting}
              >
                <MaterialIcons name="check-circle" size={26} color="#16a34a" />
                <Text style={{ color: '#15803d', fontWeight: '700', marginTop: 6 }}>OK</Text>
              </Pressable>
              <Pressable
                style={[styles.resultBtn, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}
                onPress={() => {
                  setResultModal(false);
                  setPendingResult('to_improve');
                  setEmailConfirmModal(true);
                }}
                disabled={submitting}
              >
                <MaterialIcons name="warning" size={26} color="#b45309" />
                <Text style={{ color: '#92400e', fontWeight: '700', marginTop: 6 }}>À AMÉLIORER</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal confirmation email */}
      <Modal visible={emailConfirmModal} transparent animationType="fade">
        <Pressable
          style={styles.overlay}
          onPress={() => {
            if (!submitting) {
              setEmailConfirmModal(false);
              setPendingResult(null);
            }
          }}
        >
          <Pressable style={[styles.modalBox, { width: '88%' }]} onPress={() => {}}>
            <View style={styles.emailConfirmIcon}>
              <MaterialIcons name="mark-email-unread" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { marginTop: 14 }]}>Envoi du rapport par email</Text>
            <Text style={[styles.modalSub, { marginTop: 8, lineHeight: 20 }]}>
              En validant cette intervention, le rapport PDF sera{' '}
              <Text style={{ fontWeight: '700', color: colors.onSurface }}>
                automatiquement envoyé par email
              </Text>{' '}
              au(x) client(s) du chantier{site ? ` ${site.name}` : ''}.
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: 'rgba(0,35,111,0.06)',
                borderRadius: 10,
                padding: 12,
                marginTop: 16,
              }}
            >
              <MaterialIcons name="info-outline" size={16} color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, flex: 1, lineHeight: 18 }}>
                Le PDF sera généré et joint automatiquement à l'email.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <PrimaryButton
                label="Annuler"
                variant="ghost"
                style={{ flex: 1 }}
                disabled={submitting}
                onPress={() => {
                  setEmailConfirmModal(false);
                  setPendingResult(null);
                }}
              />
              <PrimaryButton
                label={submitting ? 'Validation…' : 'Confirmer et envoyer'}
                icon="send"
                style={{ flex: 1.6 }}
                disabled={submitting}
                onPress={() => {
                  if (pendingResult) {
                    setEmailConfirmModal(false);
                    onValidate(pendingResult);
                  }
                }}
              />
            </View>
            {submitting ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal rejet */}
      <Modal visible={rejectModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setRejectModal(false)}>
          <Pressable style={[styles.modalBox, { width: '90%' }]} onPress={() => {}}>
            <Text style={styles.modalTitle}>Rejeter l'intervention</Text>
            <Text style={styles.modalSub}>
              Indique la raison à transmettre à l'agent.
            </Text>
            <TextInput
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Ex: photos floues, zone non documentée..."
              placeholderTextColor={colors.outline}
              style={[styles.textarea, { marginTop: 14 }]}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <PrimaryButton
                label="Annuler"
                variant="ghost"
                style={{ flex: 1 }}
                onPress={() => setRejectModal(false)}
              />
              <PrimaryButton
                label={submitting ? 'Envoi...' : 'Confirmer'}
                variant="danger"
                style={{ flex: 1.4 }}
                disabled={submitting}
                onPress={onReject}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.outline,
    letterSpacing: 1.4,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 18,
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
  },
  detailValue: { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginTop: 4 },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(22, 163, 74, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  photoImg: { width: '100%', height: '100%' },
  photoBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  photoCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(24,28,33,0.45)',
  },
  photoCheckIcon: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 4,
  },
  photoCheckIconActive: {
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  notesBox: {
    backgroundColor: 'rgba(241, 244, 251, 0.6)',
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  evaluationBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 14,
    gap: 8,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: 'rgba(0, 35, 111, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  evaluationComment: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
  },
  textarea: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 14,
    fontSize: 14,
    minHeight: 96,
    textAlignVertical: 'top',
    color: colors.onSurface,
    marginTop: 8,
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
  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(24,28,33,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBox: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: radii['2xl'],
    padding: 22,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
  modalSub: { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 6 },
  emailConfirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,35,111,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  resultBtn: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    paddingVertical: 16,
  },
});
