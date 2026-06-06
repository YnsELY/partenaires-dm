import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, radii, responsive } from '../../constants/theme';
import { supabase, ChecklistTask } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useClientSites } from '../../hooks/useClientSites';
import { useClientIncidents, ClientIncident } from '../../hooks/useClientIncidents';
import { Badge } from '../../components/Badge';
import { incidentDisplay } from '../../lib/incidentStatus';
import { notifyEvent } from '../../lib/notifications';

export default function ClientSignalement() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{ site_id?: string }>();
  const { sites, loading: sitesLoading } = useClientSites();

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [siteModal, setSiteModal] = useState(false);

  const [zone, setZone] = useState('');
  const [zoneModal, setZoneModal] = useState(false);
  const [zonesForSite, setZonesForSite] = useState<string[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { items: myIncidents, refresh: refreshIncidents } = useClientIncidents();

  // Rafraîchit la liste à chaque retour sur l'onglet (ex : après clôture
  // depuis l'écran détail). Filet de sécurité même si le realtime n'est
  // pas encore activé sur la table incidents.
  useFocusEffect(
    useCallback(() => {
      refreshIncidents();
    }, [refreshIncidents])
  );

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId]
  );

  // Pré-sélection via param ou fallback : 1er site disponible
  useEffect(() => {
    if (selectedSiteId) return;
    if (params.site_id) {
      setSelectedSiteId(params.site_id);
    } else if (sites.length === 1) {
      setSelectedSiteId(sites[0].id);
    }
  }, [params.site_id, sites, selectedSiteId]);

  // Charge les zones du site sélectionné
  useEffect(() => {
    if (!selectedSiteId) {
      setZonesForSite([]);
      return;
    }
    let cancelled = false;
    setZonesLoading(true);
    supabase
      .from('checklist_tasks')
      .select('zone')
      .eq('site_id', selectedSiteId)
      .then(({ data }) => {
        if (cancelled) return;
        const set = new Set<string>();
        for (const row of (data ?? []) as Pick<ChecklistTask, 'zone'>[]) {
          if (row.zone) set.add(row.zone);
        }
        setZonesForSite(Array.from(set));
        setZonesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSiteId]);

  const onSubmit = async () => {
    if (!selectedSiteId) return Alert.alert('Champ requis', 'Veuillez sélectionner un site.');
    if (!description.trim())
      return Alert.alert('Champ requis', 'Veuillez décrire brièvement le problème rencontré.');
    if (!session?.user?.id) return;

    setSubmitting(true);
    const { data: incident, error } = await supabase
      .from('incidents')
      .insert({
        site_id: selectedSiteId,
        reported_by: session.user.id,
        reporter_role: 'client',
        zone: zone.trim() || null,
        description: description.trim(),
        status: 'open',
      })
      .select('id')
      .maybeSingle();
    setSubmitting(false);

    if (error) {
      Alert.alert('Erreur', error.message);
      return;
    }

    // Reset le formulaire et refresh la liste pour voir le nouveau
    // signalement apparaître en tête.
    setZone('');
    setDescription('');
    if (incident?.id) notifyEvent('incident_created', incident.id);
    await refreshIncidents();

    Alert.alert('Signalement envoyé', 'Notre équipe va le prendre en charge.');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <Header title="Signaler un problème" onBack={() => router.back()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: responsive.hPadding,
            paddingTop: 20,
            paddingBottom: 120,
            gap: 18,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {myIncidents.length > 0 ? (
            <Card padding={18}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MaterialIcons name="flag" size={20} color={colors.primary} />
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.onSurface }}>
                  Mes signalements
                </Text>
                <Text style={{ marginLeft: 'auto', fontSize: 12, color: colors.onSurfaceVariant }}>
                  {myIncidents.length}
                </Text>
              </View>
              <View style={{ gap: 8 }}>
                {myIncidents.map((inc) => (
                  <ClientIncidentRow key={inc.id} incident={inc} />
                ))}
              </View>
            </Card>
          ) : null}

          {sitesLoading && sites.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : sites.length === 0 ? (
            <Card padding={26}>
              <View style={styles.emptyWrap}>
                <MaterialIcons name="domain" size={42} color={colors.primary} />
                <Text style={styles.emptyTitle}>Aucun site rattaché</Text>
                <Text style={styles.emptySub}>
                  Vous pourrez signaler un problème dès qu'un site vous sera rattaché par
                  l'équipe des Partenaires DM.
                </Text>
              </View>
            </Card>
          ) : (
            <Card padding={22}>
              <Text style={styles.intro}>
                Décrivez le problème rencontré. Notre équipe interviendra dans les plus brefs délais
                pour assurer la propreté et la sécurité de vos locaux.
              </Text>

              <Field label="SITE CONCERNÉ *">
                <Pressable
                  style={styles.select}
                  onPress={() => setSiteModal(true)}
                  disabled={sites.length <= 1}
                >
                  <Text
                    style={[styles.selectText, !selectedSite && { color: colors.outline }]}
                    numberOfLines={1}
                  >
                    {selectedSite?.name ?? 'Sélectionner un site'}
                  </Text>
                  {sites.length > 1 ? (
                    <MaterialIcons name="expand-more" size={22} color={colors.onSurfaceVariant} />
                  ) : null}
                </Pressable>
              </Field>

              <Field label="ZONE CONCERNÉE">
                {zonesForSite.length > 0 ? (
                  <Pressable style={styles.select} onPress={() => setZoneModal(true)}>
                    <Text
                      style={[styles.selectText, !zone && { color: colors.outline }]}
                      numberOfLines={1}
                    >
                      {zone || 'Choisir parmi les zones du site...'}
                    </Text>
                    <MaterialIcons
                      name="expand-more"
                      size={22}
                      color={colors.onSurfaceVariant}
                    />
                  </Pressable>
                ) : (
                  <TextInput
                    value={zone}
                    onChangeText={setZone}
                    placeholder={
                      zonesLoading
                        ? 'Chargement...'
                        : "ex: Hall d'accueil, Sanitaires, Bureau open space"
                    }
                    placeholderTextColor={colors.outline}
                    style={styles.textInputBox}
                  />
                )}
              </Field>

              <Field label="DESCRIPTION DE L'INCIDENT *">
                <TextInput
                  multiline
                  numberOfLines={6}
                  placeholder="Tâche sur la moquette, distributeur de savon vide, vitre cassée..."
                  placeholderTextColor={colors.outline}
                  value={description}
                  onChangeText={setDescription}
                  style={styles.textarea}
                  maxLength={1000}
                />
              </Field>

              <PrimaryButton
                label={submitting ? 'Envoi...' : 'Envoyer le signalement'}
                disabled={submitting}
                onPress={onSubmit}
              />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Site picker */}
      <Modal visible={siteModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setSiteModal(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Sélectionner un site</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {sites.map((s) => {
                const active = s.id === selectedSiteId;
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.option, active && { backgroundColor: colors.surfaceContainerLow }]}
                    onPress={() => {
                      setSelectedSiteId(s.id);
                      setZone('');
                      setSiteModal(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onSurface }}>
                        {s.name}
                      </Text>
                      {s.address ? (
                        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>
                          {s.address}
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
          </Pressable>
        </Pressable>
      </Modal>

      {/* Zone picker */}
      <Modal visible={zoneModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setZoneModal(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Sélectionner une zone</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <Pressable
                style={[styles.option, zone === '' && { backgroundColor: colors.surfaceContainerLow }]}
                onPress={() => {
                  setZone('');
                  setZoneModal(false);
                }}
              >
                <Text style={{ flex: 1, fontSize: 15, color: colors.onSurface }}>
                  — Non spécifiée
                </Text>
              </Pressable>
              {zonesForSite.map((z) => {
                const active = z === zone;
                return (
                  <Pressable
                    key={z}
                    style={[styles.option, active && { backgroundColor: colors.surfaceContainerLow }]}
                    onPress={() => {
                      setZone(z);
                      setZoneModal(false);
                    }}
                  >
                    <Text style={{ flex: 1, fontSize: 15, color: colors.onSurface }}>{z}</Text>
                    {active ? (
                      <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginVertical: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ClientIncidentRow({ incident }: { incident: ClientIncident }) {
  const display = incidentDisplay(incident.status, 'client');
  const created = new Date(incident.created_at);
  return (
    <Pressable
      style={styles.incidentRow}
      onPress={() =>
        router.push({
          pathname: '/(client)/incident/[id]',
          params: { id: incident.id },
        })
      }
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.incidentTitle} numberOfLines={1}>
          {incident.site?.name ?? 'Site'}
          {incident.zone ? ` · ${incident.zone}` : ''}
        </Text>
        <Text style={styles.incidentSub} numberOfLines={2}>
          {incident.description?.slice(0, 90) ?? 'Sans description'}
        </Text>
        <Text style={styles.incidentDate}>
          {created.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <Badge label={display.label.toUpperCase()} variant={display.variant} small />
        <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.onSurfaceVariant, fontSize: 14, lineHeight: 22, marginBottom: 12 },
  incidentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surfaceContainerLow,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.md,
  },
  incidentTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  incidentSub: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 },
  incidentDate: { fontSize: 11, color: colors.outline, marginTop: 6 },
  fieldLabel: { color: colors.primary, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  select: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectText: { fontSize: 15, color: colors.onSurface, flex: 1, marginRight: 10 },
  textInputBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.onSurface,
  },
  textarea: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 16,
    minHeight: 130,
    fontSize: 14,
    color: colors.onSurface,
    textAlignVertical: 'top',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(24,28,33,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceContainerHighest,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
  },
  emptyWrap: { alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  emptySub: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
});
