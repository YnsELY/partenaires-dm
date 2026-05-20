import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ChecklistEditor, EditableTask } from '../../components/ChecklistEditor';
import { colors, radii, responsive, typography } from '../../constants/theme';
import { supabase, Client } from '../../lib/supabase';
import { useAdminClients } from '../../hooks/useAdminClients';

export default function ChantierNew() {
  const { clients, loading: clientsLoading } = useAdminClients();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<EditableTask[]>([]);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientModal, setClientModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!selectedClient) return Alert.alert('Champ requis', 'Choisis un client.');
    if (!name.trim()) return Alert.alert('Champ requis', 'Le nom du chantier est requis.');

    setSubmitting(true);
    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .insert({
        client_id: selectedClient.id,
        name: name.trim(),
        address: address.trim() || null,
        service_type: serviceType.trim() || null,
        description: description.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    if (siteErr || !site) {
      setSubmitting(false);
      Alert.alert('Erreur', siteErr?.message ?? 'Impossible de créer le chantier');
      return;
    }

    if (tasks.length > 0) {
      const rows = tasks.map((t, i) => ({
        site_id: site.id,
        label: t.label,
        zone: t.zone,
        order_index: i,
        frequency: t.frequency,
        frequency_count: t.frequency_count,
        catalog_service_id: t.catalog_service_id,
      }));
      const { error: tasksErr } = await supabase.from('checklist_tasks').insert(rows);
      if (tasksErr) {
        setSubmitting(false);
        Alert.alert(
          'Chantier créé mais',
          `Erreur d'ajout des tâches : ${tasksErr.message}`
        );
        router.replace('/(admin)/(tabs)/home');
        return;
      }
    }

    setSubmitting(false);
    Alert.alert('Chantier créé', 'Tu peux maintenant planifier une intervention dessus.', [
      { text: 'OK', onPress: () => router.replace('/(admin)/(tabs)/home') },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Nouvelle Fiche Chantier" onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: responsive.hPadding,
            paddingTop: 18,
            paddingBottom: 140,
            gap: 22,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text style={{ ...typography.h1, color: colors.onSurface }}>Nouvelle Fiche Chantier</Text>
            <Text style={styles.subtitle}>
              Configure le site d'intervention et la checklist par zone qui sera transmise aux agents.
            </Text>
          </View>

          <Card padding={22}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>1</Text>
              </View>
              <Text style={{ ...typography.h2, color: colors.primary }}>Informations Générales</Text>
            </View>

            <Field label="NOM DU SITE *">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="ex: Résidence Les Glycines"
                placeholderTextColor={colors.outline}
                style={styles.input}
              />
            </Field>

            <Field label="CLIENT *">
              <Pressable
                style={styles.picker}
                onPress={() => setClientModal(true)}
                disabled={clientsLoading || clients.length === 0}
              >
                <Text
                  style={[styles.pickerText, !selectedClient && { color: colors.outline }]}
                  numberOfLines={1}
                >
                  {selectedClient?.name ??
                    (clients.length === 0 ? 'Aucun client disponible' : 'Choisir un client...')}
                </Text>
                <MaterialIcons name="expand-more" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
              {clients.length === 0 && !clientsLoading ? (
                <Text style={styles.helper}>
                  Crée d'abord un client depuis l'onglet Clients.
                </Text>
              ) : null}
            </Field>

            <Field label="ADRESSE DU SITE">
              <View style={styles.inputWithIcon}>
                <MaterialIcons name="location-on" size={20} color={colors.outline} />
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="123 Rue de la République, 69002 Lyon"
                  placeholderTextColor={colors.outline}
                  style={{ flex: 1, fontSize: 14, color: colors.onSurface }}
                />
              </View>
            </Field>

            <Field label="TYPE DE PRESTATION">
              <TextInput
                value={serviceType}
                onChangeText={setServiceType}
                placeholder="ex: Nettoyage hebdomadaire bureaux"
                placeholderTextColor={colors.outline}
                style={styles.input}
              />
            </Field>

            <Field label="DESCRIPTION DU SITE">
              <TextInput
                multiline
                value={description}
                onChangeText={setDescription}
                placeholder="Décris les particularités, accès, consignes..."
                placeholderTextColor={colors.outline}
                style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]}
              />
            </Field>
          </Card>

          <Card padding={22}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>2</Text>
              </View>
              <Text style={{ ...typography.h2, color: colors.primary }}>Checklist des Tâches</Text>
            </View>

            <ChecklistEditor
              tasks={tasks}
              onChange={setTasks}
              helperText="Saisis d'abord la zone, puis pioche les services dans le catalogue ou ajoute une tâche manuelle. Les nouvelles tâches utilisent la zone courante."
            />
          </Card>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PrimaryButton
              label="Annuler"
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => router.back()}
            />
            <PrimaryButton
              label={submitting ? 'Création...' : 'Créer la fiche'}
              style={{ flex: 1.4 }}
              disabled={submitting}
              onPress={onSubmit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={clientModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setClientModal(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Choisir un client</Text>
            <Text style={styles.sheetHint}>
              Il s'agit ici de l'<Text style={{ fontWeight: '700' }}>entreprise cliente</Text>{' '}
              (ex: "Nexus Corp"), pas d'un compte utilisateur.
            </Text>

            {clientsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 30 }} />
            ) : clients.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 14 }}>
                <View style={styles.emptyIcon}>
                  <MaterialIcons name="business-center" size={36} color={colors.primary} />
                </View>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.onSurface }}>
                  Aucune entreprise cliente
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.onSurfaceVariant,
                    textAlign: 'center',
                    maxWidth: 300,
                  }}
                >
                  Avant de créer un chantier, il faut au moins une entreprise cliente. Tu peux
                  l'ajouter en quelques secondes ci-dessous.
                </Text>
                <PrimaryButton
                  label="Créer un nouveau client"
                  icon="add-business"
                  onPress={() => {
                    setClientModal(false);
                    router.push('/(admin)/client-new');
                  }}
                  style={{ alignSelf: 'stretch' }}
                />
              </View>
            ) : (
              <>
                <ScrollView style={{ maxHeight: 360 }}>
                  {clients.map((c) => {
                    const active = c.id === selectedClient?.id;
                    return (
                      <Pressable
                        key={c.id}
                        style={[
                          styles.option,
                          active && { backgroundColor: colors.surfaceContainerLow },
                        ]}
                        onPress={() => {
                          setSelectedClient(c);
                          setClientModal(false);
                        }}
                      >
                        <View style={styles.clientBadge}>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                            {c.name
                              .split(' ')
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((s) => s[0]?.toUpperCase())
                              .join('')}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.onSurface }}>
                            {c.name}
                          </Text>
                          {c.contract_type ? (
                            <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>
                              {c.contract_type}
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
                <Pressable
                  style={styles.addClientBtn}
                  onPress={() => {
                    setClientModal(false);
                    router.push('/(admin)/client-new');
                  }}
                >
                  <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.addClientText}>Créer un nouveau client</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginVertical: 10 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, color: colors.onSurfaceVariant, marginTop: 8, lineHeight: 22 },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.3,
    color: colors.onSecondaryContainer,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: colors.onSurface,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  picker: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerText: { flex: 1, fontSize: 14, color: colors.onSurface, marginRight: 10 },
  helper: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 },
  addTaskBtn: {
    width: 50,
    height: 50,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.lg,
  },
  catalogBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.4 },
  manualToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  manualToggleText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  zoneSeparator: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.onSecondaryContainer,
    paddingHorizontal: 4,
    marginTop: 2,
    marginBottom: 2,
  },
  manualTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.outline,
    marginTop: 2,
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
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(24,28,33,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 28,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceContainerHighest,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 6 },
  sheetHint: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radii.md,
  },
  clientBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addClientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
  },
  addClientText: { color: colors.primary, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
});
