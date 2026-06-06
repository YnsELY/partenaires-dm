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
import { notifyEvent } from '../../lib/notifications';
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

function formatDateOnly(d: Date): string {
  return d
    .toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace('.', '');
}

type RecurrenceMode = 'single' | 'recurring';
type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

const FREQUENCY_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'daily', label: 'Quotidienne' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuelle' },
  { value: 'custom', label: 'Personnalisée' },
];

// Libellés des jours, semaine commençant le lundi (index 0 = Lundi).
const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const MAX_OCCURRENCES = 200;

function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function atStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Génère la liste des dates d'occurrence (chacune avec l'heure de `start`)
 * entre `start` (date + heure) et `end` (date de fin incluse), selon la
 * fréquence choisie. Bornée à MAX_OCCURRENCES pour éviter un volume aberrant.
 */
function buildOccurrences(opts: {
  frequency: RecurrenceFrequency;
  start: Date;
  end: Date;
  weekdays: boolean[];
  intervalDays: number;
}): Date[] {
  const { frequency, start, end, weekdays, intervalDays } = opts;
  const occ: Date[] = [];
  const hours = start.getHours();
  const minutes = start.getMinutes();
  const startDay = atStartOfDay(start);
  const endDay = atStartOfDay(end);
  endDay.setHours(23, 59, 59, 999);
  if (endDay < startDay) return occ;

  const push = (day: Date) => {
    const x = new Date(day);
    x.setHours(hours, minutes, 0, 0);
    occ.push(x);
  };

  if (frequency === 'daily') {
    for (
      const d = new Date(startDay);
      d <= endDay && occ.length < MAX_OCCURRENCES;
      d.setDate(d.getDate() + 1)
    ) {
      push(d);
    }
  } else if (frequency === 'weekly') {
    if (!weekdays.some(Boolean)) return occ;
    for (
      const d = new Date(startDay);
      d <= endDay && occ.length < MAX_OCCURRENCES;
      d.setDate(d.getDate() + 1)
    ) {
      if (weekdays[mondayIndex(d)]) push(d);
    }
  } else if (frequency === 'custom') {
    const step = Math.max(1, Math.floor(intervalDays) || 1);
    for (
      const d = new Date(startDay);
      d <= endDay && occ.length < MAX_OCCURRENCES;
      d.setDate(d.getDate() + step)
    ) {
      push(d);
    }
  } else {
    // mensuelle : même jour du mois que la date de début, en bornant aux
    // mois plus courts (ex: 31 → 30/28).
    const dom = startDay.getDate();
    let y = startDay.getFullYear();
    let m = startDay.getMonth();
    while (occ.length < MAX_OCCURRENCES) {
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const day = new Date(y, m, Math.min(dom, daysInMonth));
      if (day > endDay) break;
      if (day >= startDay) push(day);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }

  return occ;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function InterventionNew() {
  const { sites, loading: sitesLoading } = useAdminSites();
  const { agents, loading: agentsLoading } = useAdminAgents();

  const [selectedSite, setSelectedSite] = useState<SiteWithClient | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // Date/heure par défaut : demain 8h. En mode récurrent, sert de date+heure
  // de début (l'heure est appliquée à chaque occurrence).
  const [scheduledAt, setScheduledAt] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d;
  });

  // Planification récurrente
  const [mode, setMode] = useState<RecurrenceMode>('single');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('daily');
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 8); // une semaine après la date de début par défaut
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [weekdays, setWeekdays] = useState<boolean[]>(() => {
    const arr = Array(7).fill(false);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    arr[mondayIndex(tomorrow)] = true;
    return arr;
  });
  const [customIntervalDays, setCustomIntervalDays] = useState(2);

  // Picker iOS inline : 'scheduled' (date/heure de début ou intervention unique)
  // ou 'end' (date de fin, date seule).
  const [iosPicker, setIosPicker] = useState<
    { target: 'scheduled'; mode: 'date' | 'time' } | { target: 'end' } | null
  >(null);

  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const [siteModal, setSiteModal] = useState(false);
  const [agentModal, setAgentModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedAgents = useMemo(
    () => selectedAgentIds.map((id) => agents.find((a) => a.id === id)).filter(Boolean),
    [agents, selectedAgentIds]
  );

  const toggleAgent = (id: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const occurrences = useMemo(() => {
    if (mode !== 'recurring') return [];
    return buildOccurrences({
      frequency,
      start: scheduledAt,
      end: endDate,
      weekdays,
      intervalDays: customIntervalDays,
    });
  }, [mode, frequency, scheduledAt, endDate, weekdays, customIntervalDays]);

  const toggleWeekday = (idx: number) => {
    setWeekdays((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  };

  // Quand le site change, on charge ses tâches templates en snapshot local et
  // on pré-remplit les agents par défaut du chantier (site_agents).
  useEffect(() => {
    if (!selectedSite) {
      setTasks([]);
      setSelectedAgentIds([]);
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

      const { data: siteAgents } = await supabase
        .from('site_agents')
        .select('agent_id')
        .eq('site_id', selectedSite.id);
      if (!cancelled) {
        setSelectedAgentIds((siteAgents ?? []).map((r) => r.agent_id as string));
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
      setIosPicker({ target: 'scheduled', mode: 'date' });
    }
  };

  const openEndPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: endDate,
        mode: 'date',
        onChange: (_e: DateTimePickerEvent, dateVal?: Date) => {
          if (dateVal) setEndDate(dateVal);
        },
      });
    } else {
      setIosPicker({ target: 'end' });
    }
  };

  // Validations communes aux deux modes. Renvoie le site/agents si OK, sinon null.
  const validateCommon = (): { site: SiteWithClient; agentIds: string[] } | null => {
    if (!selectedSite) {
      Alert.alert('Champ requis', 'Choisis un site.');
      return null;
    }
    if (selectedAgentIds.length === 0) {
      Alert.alert('Champ requis', 'Choisis au moins un agent.');
      return null;
    }
    if (tasks.length === 0) {
      Alert.alert('Checklist vide', "Ajoute au moins une tâche à la checklist de l'intervention.");
      return null;
    }
    return { site: selectedSite, agentIds: selectedAgentIds };
  };

  const taskRowsFor = (siteId: string, interventionId: string) =>
    tasks.map((t, i) => ({
      site_id: siteId,
      intervention_id: interventionId,
      label: t.label,
      zone: t.zone,
      order_index: i,
      frequency: t.frequency,
      frequency_count: t.frequency_count,
      catalog_service_id: t.catalog_service_id,
    }));

  const onSubmit = () => {
    if (mode === 'recurring') return onSubmitRecurring();
    return onSubmitSingle();
  };

  const onSubmitSingle = async () => {
    const ok = validateCommon();
    if (!ok) return;

    setSubmitting(true);
    const { data: created, error } = await supabase
      .from('interventions')
      .insert({
        site_id: ok.site.id,
        agent_id: ok.agentIds[0],
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

    // Rattache tous les agents sélectionnés (l'agent_id ci-dessus reste le principal).
    const { error: agentsErr } = await supabase
      .from('intervention_agents')
      .insert(ok.agentIds.map((agentId) => ({ intervention_id: created.id, agent_id: agentId })));

    // Snapshot des tâches per-intervention
    const { error: tasksErr } = await supabase
      .from('checklist_tasks')
      .insert(taskRowsFor(ok.site.id, created.id));

    setSubmitting(false);

    if (agentsErr) {
      Alert.alert('Intervention créée mais', `Erreur de rattachement des agents : ${agentsErr.message}`);
    } else if (tasksErr) {
      Alert.alert('Intervention créée mais', `Erreur d'ajout des tâches : ${tasksErr.message}`);
    }
    notifyEvent('intervention_created', created.id);
    router.replace('/(admin)/(tabs)/planning');
  };

  const onSubmitRecurring = () => {
    const ok = validateCommon();
    if (!ok) return;

    if (occurrences.length === 0) {
      Alert.alert(
        'Aucune date générée',
        'La récurrence ne produit aucune intervention. Vérifie la période, la fréquence et les jours sélectionnés.'
      );
      return;
    }

    const first = occurrences[0];
    const last = occurrences[occurrences.length - 1];
    const capped = occurrences.length >= MAX_OCCURRENCES;
    Alert.alert(
      'Confirmer la planification',
      `${occurrences.length} intervention(s) seront créées du ${formatDateOnly(first)} au ${formatDateOnly(last)}.` +
        (capped ? `\n\nLimité à ${MAX_OCCURRENCES} occurrences — réduis la période si besoin.` : ''),
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Créer', onPress: () => createRecurring(ok.site, ok.agentIds) },
      ]
    );
  };

  const createRecurring = async (site: SiteWithClient, agentIds: string[]) => {
    setSubmitting(true);

    const { data: created, error } = await supabase
      .from('interventions')
      .insert(
        occurrences.map((d) => ({
          site_id: site.id,
          agent_id: agentIds[0],
          scheduled_at: d.toISOString(),
          status: 'scheduled',
        }))
      )
      .select('id, scheduled_at');

    if (error || !created || created.length === 0) {
      setSubmitting(false);
      Alert.alert('Erreur', error?.message ?? "Impossible de créer les interventions");
      return;
    }

    // Associe chaque intervention créée à son occurrence via le timestamp
    // (chaque occurrence a une date/heure unique).
    const idByEpoch = new Map<number, string>();
    for (const row of created) idByEpoch.set(new Date(row.scheduled_at).getTime(), row.id);

    const allTaskRows = occurrences.flatMap((occ) => {
      const interventionId = idByEpoch.get(occ.getTime());
      return interventionId ? taskRowsFor(site.id, interventionId) : [];
    });

    // Rattache tous les agents sélectionnés à chaque intervention créée.
    const allAgentRows = created.flatMap((row) =>
      agentIds.map((agentId) => ({ intervention_id: row.id, agent_id: agentId }))
    );

    let opErr: string | null = null;
    for (const part of chunk(allAgentRows, 500)) {
      const { error: err } = await supabase.from('intervention_agents').insert(part);
      if (err) {
        opErr = err.message;
        break;
      }
    }
    if (!opErr) {
      for (const part of chunk(allTaskRows, 500)) {
        const { error: err } = await supabase.from('checklist_tasks').insert(part);
        if (err) {
          opErr = err.message;
          break;
        }
      }
    }

    setSubmitting(false);

    if (opErr) {
      Alert.alert(
        'Interventions créées mais',
        `Erreur de finalisation (agents/checklists) : ${opErr}`
      );
    }
    // Une seule notification pour tout le lot, pour ne pas spammer l'agent.
    notifyEvent('intervention_created', created[0].id);
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
            Sélectionne un site, un agent et une date/heure. Passe en mode récurrent pour
            planifier automatiquement la même prestation sur une période (quotidienne,
            hebdomadaire, mensuelle ou personnalisée). La checklist du chantier est chargée
            automatiquement — tu peux l'ajuster.
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

            <Field label="AGENT(S) *">
              <Pressable
                style={styles.picker}
                onPress={() => setAgentModal(true)}
                disabled={agentsLoading || agents.length === 0}
              >
                <Text
                  style={[styles.pickerText, selectedAgents.length === 0 && { color: colors.outline }]}
                  numberOfLines={1}
                >
                  {selectedAgents.length === 0
                    ? agents.length === 0
                      ? 'Aucun agent disponible'
                      : 'Choisir un ou plusieurs agents...'
                    : `${selectedAgents.length} agent(s) sélectionné(s)`}
                </Text>
                <MaterialIcons name="expand-more" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
              {selectedAgents.length > 0 ? (
                <View style={styles.chipWrap}>
                  {selectedAgents.map((a) => (
                    <View key={a!.id} style={styles.agentChip}>
                      <Text style={styles.agentChipText} numberOfLines={1}>
                        {a!.full_name ?? a!.email ?? 'Agent'}
                      </Text>
                      <Pressable hitSlop={6} onPress={() => toggleAgent(a!.id)}>
                        <MaterialIcons name="close" size={16} color={colors.primary} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </Field>

            {/* Type de planification : intervention unique ou récurrente */}
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.fieldLabel}>TYPE DE PLANIFICATION</Text>
              <View style={styles.segment}>
                {(['single', 'recurring'] as RecurrenceMode[]).map((m) => {
                  const active = mode === m;
                  return (
                    <Pressable
                      key={m}
                      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                      onPress={() => setMode(m)}
                    >
                      <MaterialIcons
                        name={m === 'single' ? 'event' : 'event-repeat'}
                        size={18}
                        color={active ? '#fff' : colors.onSurfaceVariant}
                      />
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                        {m === 'single' ? 'Unique' : 'Récurrent'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {mode === 'recurring' ? (
              <>
                <Field label="FRÉQUENCE *">
                  <View style={styles.pillRow}>
                    {FREQUENCY_OPTIONS.map((opt) => {
                      const active = frequency === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          style={[styles.pill, active && styles.pillActive]}
                          onPress={() => setFrequency(opt.value)}
                        >
                          <Text style={[styles.pillText, active && styles.pillTextActive]}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>

                {frequency === 'weekly' ? (
                  <Field label="JOURS DE LA SEMAINE *">
                    <View style={styles.dayRow}>
                      {WEEKDAY_LABELS.map((label, idx) => {
                        const active = weekdays[idx];
                        return (
                          <Pressable
                            key={idx}
                            style={[styles.dayChip, active && styles.dayChipActive]}
                            onPress={() => toggleWeekday(idx)}
                          >
                            <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.helper}>
                      Sélectionne 1 à 7 jours par semaine.
                    </Text>
                  </Field>
                ) : null}

                {frequency === 'custom' ? (
                  <Field label="RÉPÉTER TOUS LES">
                    <View style={styles.stepperRow}>
                      <Pressable
                        style={styles.stepperBtn}
                        onPress={() => setCustomIntervalDays((n) => Math.max(1, n - 1))}
                      >
                        <MaterialIcons name="remove" size={20} color={colors.primary} />
                      </Pressable>
                      <Text style={styles.stepperValue}>{customIntervalDays} jour(s)</Text>
                      <Pressable
                        style={styles.stepperBtn}
                        onPress={() => setCustomIntervalDays((n) => Math.min(365, n + 1))}
                      >
                        <MaterialIcons name="add" size={20} color={colors.primary} />
                      </Pressable>
                    </View>
                  </Field>
                ) : null}
              </>
            ) : null}

            <Field label={mode === 'single' ? 'DATE & HEURE *' : 'DÉBUT & HEURE *'}>
              <Pressable style={styles.picker} onPress={openScheduledPicker}>
                <MaterialIcons name="event" size={20} color={colors.primary} />
                <Text style={[styles.pickerText, { marginLeft: 10 }]} numberOfLines={1}>
                  {formatScheduledLabel(scheduledAt)}
                </Text>
                <MaterialIcons name="expand-more" size={22} color={colors.onSurfaceVariant} />
              </Pressable>

              {Platform.OS === 'ios' && iosPicker?.target === 'scheduled' ? (
                <View style={styles.iosPickerBox}>
                  <DateTimePicker
                    value={scheduledAt}
                    mode={iosPicker.mode}
                    display="spinner"
                    onChange={(_, val) => {
                      if (val) setScheduledAt(val);
                    }}
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {iosPicker.mode === 'date' ? (
                      <PrimaryButton
                        label="Choisir l'heure"
                        size="sm"
                        style={{ flex: 1 }}
                        onPress={() => setIosPicker({ target: 'scheduled', mode: 'time' })}
                      />
                    ) : (
                      <PrimaryButton
                        label="OK"
                        size="sm"
                        style={{ flex: 1 }}
                        onPress={() => setIosPicker(null)}
                      />
                    )}
                  </View>
                </View>
              ) : null}
            </Field>

            {mode === 'recurring' ? (
              <Field label="FIN *">
                <Pressable style={styles.picker} onPress={openEndPicker}>
                  <MaterialIcons name="event-available" size={20} color={colors.primary} />
                  <Text style={[styles.pickerText, { marginLeft: 10 }]} numberOfLines={1}>
                    {formatDateOnly(endDate)}
                  </Text>
                  <MaterialIcons name="expand-more" size={22} color={colors.onSurfaceVariant} />
                </Pressable>

                {Platform.OS === 'ios' && iosPicker?.target === 'end' ? (
                  <View style={styles.iosPickerBox}>
                    <DateTimePicker
                      value={endDate}
                      mode="date"
                      display="spinner"
                      onChange={(_, val) => {
                        if (val) setEndDate(val);
                      }}
                    />
                    <PrimaryButton
                      label="OK"
                      size="sm"
                      style={{ flex: 1 }}
                      onPress={() => setIosPicker(null)}
                    />
                  </View>
                ) : null}

                <View style={styles.previewBox}>
                  <MaterialIcons
                    name={occurrences.length === 0 ? 'error-outline' : 'event-repeat'}
                    size={18}
                    color={occurrences.length === 0 ? colors.error : colors.primary}
                  />
                  <Text style={styles.previewText}>
                    {occurrences.length === 0
                      ? 'Aucune intervention générée — vérifie la période et la fréquence.'
                      : `${occurrences.length} intervention(s) — du ${formatDateOnly(
                          occurrences[0]
                        )} au ${formatDateOnly(occurrences[occurrences.length - 1])}.`}
                  </Text>
                </View>
              </Field>
            ) : null}
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
            label={
              submitting
                ? 'Création...'
                : mode === 'recurring'
                  ? `Créer ${occurrences.length} intervention(s)`
                  : "Créer l'intervention"
            }
            icon={mode === 'recurring' ? 'event-repeat' : 'event'}
            size="lg"
            disabled={submitting || (mode === 'recurring' && occurrences.length === 0)}
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

      <MultiPickerModal
        visible={agentModal}
        title="Choisir un ou plusieurs agents"
        loading={agentsLoading}
        empty="Crée d'abord un agent depuis l'onglet Équipes."
        onClose={() => setAgentModal(false)}
        items={agents.map((a) => ({
          id: a.id,
          title: a.full_name ?? a.email ?? 'Agent',
          subtitle: a.email ?? undefined,
        }))}
        selectedIds={selectedAgentIds}
        onToggle={toggleAgent}
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

function MultiPickerModal({
  visible,
  title,
  items,
  loading,
  empty,
  selectedIds,
  onClose,
  onToggle,
}: {
  visible: boolean;
  title: string;
  items: { id: string; title: string; subtitle?: string }[];
  loading?: boolean;
  empty: string;
  selectedIds: string[];
  onClose: () => void;
  onToggle: (id: string) => void;
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
            <>
              <ScrollView style={{ maxHeight: 380 }}>
                {items.map((it) => {
                  const active = selectedIds.includes(it.id);
                  return (
                    <Pressable
                      key={it.id}
                      style={[styles.option, active && { backgroundColor: colors.surfaceContainerLow }]}
                      onPress={() => onToggle(it.id)}
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
                      <MaterialIcons
                        name={active ? 'check-box' : 'check-box-outline-blank'}
                        size={22}
                        color={active ? colors.primary : colors.outline}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
              <PrimaryButton
                label={selectedIds.length > 0 ? `Valider (${selectedIds.length})` : 'Valider'}
                size="md"
                style={{ marginTop: 12 }}
                onPress={onClose}
              />
            </>
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
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  agentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 35, 111, 0.10)',
    borderWidth: 1,
    borderColor: colors.primary,
    maxWidth: '100%',
  },
  agentChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    flexShrink: 1,
  },
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
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: radii.md,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  segmentTextActive: {
    color: '#fff',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillActive: {
    backgroundColor: 'rgba(0, 35, 111, 0.10)',
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  pillTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  dayRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayChip: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  dayChipTextActive: {
    color: '#fff',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 35, 111, 0.08)',
  },
  stepperValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
    minWidth: 84,
    textAlign: 'center',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerLow,
  },
  previewText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
    lineHeight: 18,
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
