import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Avatar } from '../../components/Avatar';
import { ChecklistEditor, EditableTask } from '../../components/ChecklistEditor';
import { colors, radii, responsive, typography } from '../../constants/theme';
import { supabase, ChecklistTask } from '../../lib/supabase';
import { useAdminSites, SiteWithClient } from '../../hooks/useAdminSites';
import { useAdminAgents } from '../../hooks/useAdminAgents';

function formatScheduledLabel(d: Date): string {
  return d
    .toLocaleString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace('.', '');
}

export default function InterventionNew() {
  const { sites, loading: sitesLoading } = useAdminSites();
  const { agents, loading: agentsLoading } = useAdminAgents();

  const [selectedSite, setSelectedSite] = useState<SiteWithClient | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Date/heure par défaut : demain 8h
  const [scheduledAt, setScheduledAt] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [iosPickerMode, setIosPickerMode] = useState<'date' | 'time' | null>(null);

  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [siteModal, setSiteModal] = useState(false);
  const [agentModal, setAgentModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  // Quand le site change, on charge ses tâches templates en snapshot local.
  useEffect(() => {
    if (!selectedSite) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    setLoadingTemplate(true);
    (async () => {
      const { data, error } = await supabase
        .from('checklist_tasks')
        .select('*')
        .eq('site_id', selectedSite.id)
        .is('intervention_id', null)
        .order('order_index', { ascending: true });

      if (cancelled) return;
      if (error) {
        Alert.alert('Erreur', `Impossible de charger la checklist : ${error.message}`);
        setTasks([]);
      } else {
        setTasks(
          (data ?? []).map((t: ChecklistTask, i) => ({
            localId: `tpl-${t.id}-${i}`,
            label: t.label,
            zone: t.zone ?? 'Général',
            frequency: t.frequency,
            frequency_count: t.frequency_count,
            catalog_service_id: t.catalog_service_id,
          }))
        );
      }
      setLoadingTemplate(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSite]);

  const openScheduledPicker = () => {
    if (Platform.OS === 'android') {
      // Android : ouvrir d'abord la date, puis l'heure (datetime n'existe pas).
      DateTimePickerAndroid.open({
        value: scheduledAt,
        mode: 'date',
        onChange: (_e1: DateTimePickerEvent, dateVal?: Date) => {
          if (!dateVal) return;
          DateTimePickerAndroid.open({
            value: dateVal,
            mode: 'time',
            is24Hour: true,
            onChange: (_e2: DateTimePickerEvent, timeVal?: Date) => {
              if (!timeVal) return;
              const combined = new Date(dateVal);
              combined.setHours(timeVal.getHours(), timeVal.getMinutes(), 0, 0);
              setScheduledAt(combined);
            },
          });
        },
      });
    } else {
      // iOS : on toggle un inline picker en deux temps (date puis heure).
      setIosPickerMode('date');
    }
  };

  const onSubmit = async () => {
    if (!selectedSite) return Alert.alert('Champ requis', 'Choisis un site.');
    if (!selectedAgentId) return Alert.alert('Champ requis', 'Choisis un agent.');
    if (tasks.length === 0) {
      return Alert.alert(
        'Checklist vide',
        "Ajoute au moins une tâche à la checklist de l'intervention."
      );
    }

    setSubmitting(true);
    const { data: created, error } = await supabase
      .from('interventions')
      .insert({
        site_id: selectedSite.id,
        agent_id: selectedAgentId,
        scheduled_at: scheduledAt.toISOString(),
        status: 'scheduled',
      })
      .select('id')
      .single();

    if (error || !created) {
      setSubmitting(false);
      Alert.alert('Erreur', error?.message ?? "Impossible de créer l'intervention");
      return;
    }

    // Snapshot des tâches per-intervention
    const { error: tasksErr } = await supabase.from('checklist_tasks').insert(
      tasks.map((t, i) => ({
        site_id: selectedSite.id,
        intervention_id: created.id,
        label: t.label,
        zone: t.zone,
        order_index: i,
        frequency: t.frequency,
        frequency_count: t.frequency_count,
        catalog_service_id: t.catalog_service_id,
      }))
    );

    setSubmitting(false);

    if (tasksErr) {
      Alert.alert(
        'Intervention créée mais',
        `Erreur d'ajout des tâches : ${tasksErr.message}`
      );
    }
    router.replace('/(admin)/(tabs)/planning');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Planifier une intervention" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: responsive.hPadding,
            paddingTop: 16,
            paddingBottom: 120,
            gap: 18,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subtitle}>
            Sélectionne un site, un agent et une date/heure. La checklist du chantier est
            chargée automatiquement — tu peux l'ajuster pour cette intervention.
          </Text>

          <Card padding={22}>
            <Field label="SITE *">
              <Pressable
                style={styles.picker}
                onPress={() => setSiteModal(true)}
                disabled={sitesLoading || sites.length === 0}
              >
                <Text
                  style={[
                    styles.pickerText,
                    !selectedSite && { color: colors.outline },
                  ]}
                  numberOfLines={1}
                >
                  {selectedSite?.name ??
                    (sites.length === 0 ? 'Aucun site disponible' : 'Choisir un site...')}
                </Text>
                <MaterialIcons name="expand-more" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
              {selectedSite ? (
                <Text style={styles.helper}>
                  {selectedSite.client?.name ?? '—'} •{' '}
                  {selectedSite.address ?? 'Adresse non renseignée'}
                </Text>
              ) : null}
            </Field>

            <Field label="AGENT *">
              <Pressable
                style={styles.picker}
                onPress={() => setAgentModal(true)}
                disabled={agentsLoading || agents.length === 0}
              >
                <Text
                  style={[styles.pickerText, !selectedAgent && { color: colors.outline }]}
                  numberOfLines={1}
                >
                  {selectedAgent?.full_name ??
                    (agents.length === 0 ? 'Aucun agent disponible' : 'Choisir un agent...')}
                </Text>
                <MaterialIcons name="expand-more" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </Field>

            <Field label="DATE & HEURE *">
              <Pressable style={styles.picker} onPress={openScheduledPicker}>
                <MaterialIcons name="event" size={20} color={colors.primary} />
                <Text style={[styles.pickerText, { marginLeft: 10 }]} numberOfLines={1}>
                  {formatScheduledLabel(scheduledAt)}
                </Text>
                <MaterialIcons name="expand-more" size={22} color={colors.onSurfaceVariant} />
              </Pressable>

              {Platform.OS === 'ios' && iosPickerMode ? (
                <View style={styles.iosPickerBox}>
                  <DateTimePicker
                    value={scheduledAt}
                    mode={iosPickerMode}
                    display="spinner"
                    onChange={(_, val) => {
                      if (val) setScheduledAt(val);
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {iosPickerMode === 'date' ? (
                      <PrimaryButton
                        label="Choisir l'heure"
                        size="sm"
                        style={{ flex: 1 }}
                        onPress={() => setIosPickerMode('time')}
                      />
                    ) : (
                      <PrimaryButton
                        label="OK"
                        size="sm"
                        style={{ flex: 1 }}
                        onPress={() => setIosPickerMode(null)}
                      />
                    )}
                  </View>
                </View>
              ) : null}
            </Field>
          </Card>

          <Card padding={22}>
            <View style={styles.stepHeader}>
              <MaterialIcons name="checklist" size={22} color={colors.primary} />
              <Text style={{ ...typography.h2, color: colors.primary }}>
                Checklist de cette intervention
              </Text>
            </View>

            {!selectedSite ? (
              <Text style={styles.helperBox}>
                Choisis un site pour charger sa checklist par défaut.
              </Text>
            ) : loadingTemplate ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <ChecklistEditor
                tasks={tasks}
                onChange={setTasks}
                helperText="Cette checklist est un snapshot pour CETTE intervention uniquement. Tu peux ajouter, retirer ou compléter sans toucher au chantier."
              />
            )}
          </Card>

          <PrimaryButton
            label={submitting ? 'Création...' : "Créer l'intervention"}
            icon="event"
            size="lg"
            disabled={submitting}
            onPress={onSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal
        visible={siteModal}
        title="Choisir un site"
        loading={sitesLoading}
        empty="Crée d'abord un chantier depuis l'onglet Home."
        onClose={() => setSiteModal(false)}
        items={sites.map((s) => ({
          id: s.id,
          title: s.name,
          subtitle: `${s.client?.name ?? '—'}${s.address ? ` • ${s.address}` : ''}`,
        }))}
        selectedId={selectedSite?.id}
        onSelect={(id) => {
          const s = sites.find((x) => x.id === id);
          if (s) setSelectedSite(s);
          setSiteModal(false);
        }}
      />

      <PickerModal
        visible={agentModal}
        title="Choisir un agent"
        loading={agentsLoading}
        empty="Crée d'abord un agent depuis l'onglet Équipes."
        onClose={() => setAgentModal(false)}
        items={agents.map((a) => ({
          id: a.id,
          title: a.full_name ?? a.email ?? 'Agent',
          subtitle: a.email ?? undefined,
        }))}
        selectedId={selectedAgentId ?? undefined}
        onSelect={(id) => {
          setSelectedAgentId(id);
          setAgentModal(false);
        }}
      />
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PickerModal({
  visible,
  title,
  items,
  loading,
  empty,
  selectedId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  items: { id: string; title: string; subtitle?: string }[];
  loading?: boolean;
  empty: string;
  selectedId?: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ paddingVertical: 30 }} />
          ) : items.length === 0 ? (
            <Text style={styles.emptySub}>{empty}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {items.map((it) => {
                const active = it.id === selectedId;
                return (
                  <Pressable
                    key={it.id}
                    style={[styles.option, active && { backgroundColor: colors.surfaceContainerLow }]}
                    onPress={() => onSelect(it.id)}
                  >
                    <Avatar
                      size={36}
                      initials={(it.title ?? '?')
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((s) => s[0]?.toUpperCase())
                        .join('')}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onSurface }} numberOfLines={1}>
                        {it.title}
                      </Text>
                      {it.subtitle ? (
                        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }} numberOfLines={1}>
                          {it.subtitle}
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
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, color: colors.onSurfaceVariant, lineHeight: 22 },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: colors.onSecondaryContainer,
    marginBottom: 8,
  },
  picker: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerText: { fontSize: 15, color: colors.onSurface, flex: 1, marginRight: 10 },
  helper: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 6 },
  helperBox: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceContainerLow,
    padding: 14,
    borderRadius: radii.md,
    textAlign: 'center',
  },
  iosPickerBox: {
    marginTop: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 10,
    gap: 8,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(24,28,33,0.45)', justifyContent: 'flex-end' },
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
