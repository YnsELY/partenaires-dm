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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Card } from '../../../components/Card';
import { Avatar } from '../../../components/Avatar';
import { Badge } from '../../../components/Badge';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { PhotoViewer, ViewerPhoto } from '../../../components/PhotoViewer';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { supabase, Incident, Site, Profile, Media } from '../../../lib/supabase';
import { incidentDisplay } from '../../../lib/incidentStatus';
import { useAdminAgents } from '../../../hooks/useAdminAgents';
import { notifyEvent } from '../../../lib/notifications';

type Bundle = Incident & {
  site: Pick<Site, 'id' | 'name' | 'address'> | null;
  reporter: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
  assigned_agent: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

export default function AdminIncidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { agents, loading: agentsLoading } = useAdminAgents();

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [resolutionPhotos, setResolutionPhotos] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState<string | null>(null);
  const [agentModal, setAgentModal] = useState(false);
  const [acting, setActing] = useState(false);
  const [viewer, setViewer] = useState<{
    photos: ViewerPhoto[];
    initialIndex: number;
  } | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === assignedAgentId) ?? null,
    [agents, assignedAgentId]
  );

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
        site:sites ( id, name, address ),
        reporter:profiles!incidents_reported_by_fkey ( id, full_name, email ),
        assigned_agent:profiles!incidents_assigned_agent_id_fkey ( id, full_name, email )
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
    setNotes(b.admin_notes ?? '');
    setAssignedAgentId(b.assigned_agent_id);

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

  /** Sauvegarde uniquement les notes internes (action neutre, n'avance pas le workflow). */
  const saveNotes = useCallback(async () => {
    if (!bundle) return;
    setActing(true);
    const { error: err } = await supabase
      .from('incidents')
      .update({ admin_notes: notes.trim() || null })
      .eq('id', bundle.id);
    setActing(false);
    if (err) {
      Alert.alert('Erreur', err.message);
      return;
    }
    Alert.alert('Notes enregistrées');
  }, [bundle, notes]);

  /** Assigner / Re-assigner à un agent → status passe à 'assigned'. */
  const assignToAgent = useCallback(async () => {
    if (!bundle) return;
    if (!assignedAgentId) {
      Alert.alert('Agent requis', 'Choisis un agent avant d\'envoyer.');
      return;
    }
    setActing(true);
    const { error: err } = await supabase
      .from('incidents')
      .update({
        status: 'assigned',
        assigned_agent_id: assignedAgentId,
        admin_notes: notes.trim() || null,
      })
      .eq('id', bundle.id);
    setActing(false);
    if (err) {
      Alert.alert('Erreur', err.message);
      return;
    }
    notifyEvent('incident_assigned', bundle.id);
    Alert.alert('Signalement envoyé', "L'agent a reçu le signalement.", [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }, [bundle, assignedAgentId, notes]);

  /** Valider la résolution proposée par l'agent → status 'resolved'. */
  const validateResolution = useCallback(async () => {
    if (!bundle) return;
    Alert.alert(
      'Valider la résolution',
      "Confirmer la résolution du signalement ? Le client sera notifié et pourra clôturer.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          style: 'default',
          onPress: async () => {
            setActing(true);
            const { error: err } = await supabase
              .from('incidents')
              .update({
                status: 'resolved',
                admin_notes: notes.trim() || null,
              })
              .eq('id', bundle.id);
            setActing(false);
            if (err) {
              Alert.alert('Erreur', err.message);
              return;
            }
            notifyEvent('incident_resolved', bundle.id);
            Alert.alert('Résolution validée', '', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          },
        },
      ]
    );
  }, [bundle, notes]);

  const openViewer = (photos: Media[], index: number) => {
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
            {error ?? 'Signalement introuvable.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const created = new Date(bundle.created_at);
  const display = incidentDisplay(bundle.status, 'admin');
  const canPickAgent =
    bundle.status === 'open' || bundle.status === 'pending_validation';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Signalement" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 16,
          paddingBottom: 120,
          gap: 22,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center' }}>
          <Badge label={display.label.toUpperCase()} variant={display.variant} withDot />
        </View>

        <Card padding={22}>
          <Text style={styles.kicker}>SITE CONCERNÉ</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 4 }}>
            {bundle.site?.name ?? '—'}
          </Text>
          {bundle.site?.address ? (
            <Text style={{ fontSize: 13, color: colors.onSurfaceVariant, marginTop: 4 }}>
              {bundle.site.address}
            </Text>
          ) : null}

          <View style={styles.detailGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>SIGNALÉ PAR</Text>
              <Text style={styles.detailValue}>
                {bundle.reporter?.full_name ?? bundle.reporter?.email ?? '—'}
              </Text>
              <Text style={{ fontSize: 11, color: colors.outline, marginTop: 2 }}>
                {bundle.reporter_role.toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>DATE</Text>
              <Text style={styles.detailValue}>
                {created.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}{' '}
                • {created.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        </Card>

        {bundle.zone ? (
          <Card padding={18} variant="low" noShadow>
            <Text style={styles.kicker}>ZONE</Text>
            <Text style={{ fontSize: 15, color: colors.onSurface, marginTop: 4 }}>
              {bundle.zone}
            </Text>
          </Card>
        ) : null}

        <Card padding={22}>
          <Text style={styles.kicker}>DESCRIPTION DU PROBLÈME</Text>
          <Text style={{ fontSize: 14, color: colors.onSurface, marginTop: 8, lineHeight: 22 }}>
            {bundle.description?.trim() || 'Aucune description fournie.'}
          </Text>

          {bundle.photo_url ? (
            <View style={{ marginTop: 14 }}>
              <Pressable
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
                  style={styles.photo}
                  resizeMode="cover"
                />
              </Pressable>
            </View>
          ) : null}
        </Card>

        {/* Photos de résolution + notes de l'agent (visibles dès que l'agent a uploadé) */}
        {resolutionPhotos.length > 0 || bundle.agent_resolution_notes ? (
          <Card padding={22}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="photo-library" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
                Résolution proposée par l'agent
              </Text>
              <Text style={{ marginLeft: 'auto', fontSize: 12, color: colors.onSurfaceVariant }}>
                {resolutionPhotos.length} photo{resolutionPhotos.length > 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 }}>
              {bundle.assigned_agent?.full_name ?? "L'agent assigné"} — tap pour agrandir.
            </Text>
            {resolutionPhotos.length > 0 ? (
              <View style={styles.resolutionGrid}>
                {resolutionPhotos.map((p, i) => (
                  <Pressable
                    key={p.id}
                    style={styles.resolutionTile}
                    onPress={() => openViewer(resolutionPhotos, i)}
                  >
                    <Image
                      source={{ uri: p.url }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {bundle.agent_resolution_notes ? (
              <View style={styles.resolutionNotesBox}>
                <Text style={styles.kicker}>NOTES DE L'AGENT</Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.onSurface,
                    marginTop: 6,
                    lineHeight: 20,
                    fontStyle: 'italic',
                  }}
                >
                  {bundle.agent_resolution_notes}
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Card Action selon le statut */}
        {bundle.status !== 'resolved' && bundle.status !== 'closed' ? (
          <Card padding={22}>
            <Text style={styles.kicker}>ACTION</Text>

            {canPickAgent ? (
              <>
                <Pressable
                  style={styles.picker}
                  onPress={() => setAgentModal(true)}
                  disabled={agentsLoading || agents.length === 0}
                >
                  <Text
                    style={[
                      styles.pickerText,
                      !selectedAgent && { color: colors.outline },
                    ]}
                    numberOfLines={1}
                  >
                    {selectedAgent?.full_name ??
                      selectedAgent?.email ??
                      (agents.length === 0
                        ? 'Aucun agent disponible'
                        : 'Choisir un agent…')}
                  </Text>
                  <MaterialIcons
                    name="expand-more"
                    size={22}
                    color={colors.onSurfaceVariant}
                  />
                </Pressable>
                <PrimaryButton
                  label={
                    acting
                      ? 'Envoi…'
                      : bundle.status === 'pending_validation'
                      ? "Re-assigner à l'agent"
                      : "Assigner à l'agent"
                  }
                  icon="send"
                  size="lg"
                  disabled={acting || !assignedAgentId}
                  onPress={assignToAgent}
                  style={{ marginTop: 12 }}
                />
              </>
            ) : null}

            {bundle.status === 'assigned' || bundle.status === 'in_progress' ? (
              <View style={styles.waitingBox}>
                <MaterialIcons name="hourglass-empty" size={20} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.waitingTitle}>
                    En attente du retour de {bundle.assigned_agent?.full_name ?? "l'agent"}
                  </Text>
                  <Text style={styles.waitingSub}>
                    {bundle.status === 'assigned'
                      ? "L'agent n'a pas encore démarré le traitement."
                      : "L'agent a démarré le traitement et finalise sa résolution."}
                  </Text>
                </View>
              </View>
            ) : null}

            {bundle.status === 'pending_validation' ? (
              <PrimaryButton
                label={acting ? 'Validation…' : 'Valider la résolution'}
                icon="check-circle"
                size="lg"
                disabled={acting}
                onPress={validateResolution}
                style={{ marginTop: 12 }}
              />
            ) : null}
          </Card>
        ) : null}

        {bundle.status === 'resolved' || bundle.status === 'closed' ? (
          <View style={styles.finalBanner}>
            <MaterialIcons name="check-circle" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600', flex: 1 }}>
              {bundle.status === 'closed'
                ? 'Signalement clôturé par le client.'
                : 'Résolution validée, en attente de clôture par le client.'}
            </Text>
          </View>
        ) : null}

        <Card padding={22}>
          <Text style={styles.kicker}>NOTES INTERNES (jamais visibles côté client)</Text>
          <TextInput
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder="Actions prises, contact client, etc."
            placeholderTextColor="rgba(68, 70, 82, 0.5)"
            style={styles.textarea}
          />
          <PrimaryButton
            label={acting ? 'Enregistrement…' : 'Enregistrer les notes'}
            icon="save"
            variant="outline"
            disabled={acting}
            onPress={saveNotes}
            style={{ marginTop: 10 }}
          />
        </Card>
      </ScrollView>

      <Modal visible={agentModal} animationType="slide" transparent>
        <Pressable style={styles.overlay} onPress={() => setAgentModal(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Choisir un agent</Text>
            {agentsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 30 }} />
            ) : agents.length === 0 ? (
              <Text style={styles.emptySub}>
                Aucun agent disponible. Crée d'abord un agent depuis l'onglet Équipes.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {agents.map((a) => {
                  const active = a.id === assignedAgentId;
                  const initials =
                    (a.full_name ?? a.email ?? '?')
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((s) => s[0]?.toUpperCase())
                      .join('') || '?';
                  return (
                    <Pressable
                      key={a.id}
                      style={[
                        styles.option,
                        active && { backgroundColor: colors.surfaceContainerLow },
                      ]}
                      onPress={() => {
                        setAssignedAgentId(a.id);
                        setAgentModal(false);
                      }}
                    >
                      <Avatar size={36} initials={initials} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ fontSize: 15, fontWeight: '600', color: colors.onSurface }}
                          numberOfLines={1}
                        >
                          {a.full_name ?? a.email ?? 'Agent'}
                        </Text>
                        {a.email ? (
                          <Text
                            style={{ fontSize: 12, color: colors.onSurfaceVariant }}
                            numberOfLines={1}
                          >
                            {a.email}
                          </Text>
                        ) : null}
                      </View>
                      {active ? (
                        <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
  detailGrid: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 18,
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
  },
  detailValue: { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginTop: 4 },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
  },
  picker: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  pickerText: { flex: 1, fontSize: 14, color: colors.onSurface, marginRight: 10 },
  waitingBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
    padding: 14,
    borderRadius: radii.md,
    marginTop: 12,
  },
  waitingTitle: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
  waitingSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 },
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
  resolutionNotesBox: {
    backgroundColor: colors.surfaceContainerLow,
    padding: 14,
    borderRadius: radii.md,
    marginTop: 14,
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(24,28,33,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 8,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceContainerHighest,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radii.md,
  },
  emptySub: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    paddingVertical: 24,
    textAlign: 'center',
  },
});
