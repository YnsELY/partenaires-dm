import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radii, typography } from '../constants/theme';
import { Frequency, CatalogService } from '../lib/supabase';
import { ChecklistPicker } from './ChecklistPicker';
import { formatFrequencyBadge } from '../hooks/useCatalog';

export type EditableTask = {
  localId: string;
  label: string;
  zone: string;
  frequency: Frequency | null;
  frequency_count: number | null;
  catalog_service_id: string | null;
};

type Props = {
  tasks: EditableTask[];
  onChange: (next: EditableTask[]) => void;
  /** Texte d'aide affiché en haut. Optionnel. */
  helperText?: string;
};

/**
 * Bloc d'édition de checklist réutilisable :
 * - Champ "Zone courante" (texte libre, persistant entre ajouts)
 * - Bouton "Choisir depuis le catalogue" → ChecklistPicker
 * - Toggle "Ajouter un service manuel"
 * - Liste groupée par zone avec suppression individuelle
 *
 * Utilisé par chantier-new (création site) et intervention-new
 * (snapshot per-intervention).
 */
export function ChecklistEditor({ tasks, onChange, helperText }: Props) {
  const [currentZone, setCurrentZone] = useState('Général');
  const [manualOpen, setManualOpen] = useState(false);
  const [newTaskLabel, setNewTaskLabel] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const addManualTask = () => {
    if (!newTaskLabel.trim()) return;
    onChange([
      ...tasks,
      {
        localId: `m-${Date.now()}`,
        label: newTaskLabel.trim(),
        zone: currentZone.trim() || 'Général',
        frequency: null,
        frequency_count: null,
        catalog_service_id: null,
      },
    ]);
    setNewTaskLabel('');
  };

  const addCatalogServices = (services: CatalogService[]) => {
    const zone = currentZone.trim() || 'Général';
    onChange([
      ...tasks,
      ...services.map((s, i) => ({
        localId: `c-${s.id}-${Date.now()}-${i}`,
        label: s.label,
        zone,
        frequency: s.frequency,
        frequency_count: s.frequency_count,
        catalog_service_id: s.id,
      })),
    ]);
  };

  const removeTask = (id: string) => onChange(tasks.filter((x) => x.localId !== id));

  const alreadySelectedIds = useMemo(
    () =>
      new Set(
        tasks.map((t) => t.catalog_service_id).filter((x): x is string => !!x)
      ),
    [tasks]
  );

  const tasksByZone = useMemo(() => {
    const out: { zone: string; items: EditableTask[] }[] = [];
    for (const t of tasks) {
      const last = out[out.length - 1];
      if (last && last.zone === t.zone) last.items.push(t);
      else out.push({ zone: t.zone, items: [t] });
    }
    return out;
  }, [tasks]);

  return (
    <>
      <View style={{ gap: 10, marginBottom: 16 }}>
        {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}

        <View>
          <Text style={styles.fieldLabel}>ZONE COURANTE</Text>
          <TextInput
            value={currentZone}
            onChangeText={setCurrentZone}
            placeholder="ex: Hall, RDC, Sanitaires 1er étage…"
            placeholderTextColor={colors.outline}
            style={styles.input}
          />
        </View>

        <Pressable style={styles.catalogBtn} onPress={() => setPickerOpen(true)}>
          <MaterialIcons name="library-add-check" size={20} color="#fff" />
          <Text style={styles.catalogBtnText}>Choisir depuis le catalogue</Text>
        </Pressable>

        <Pressable style={styles.manualToggle} onPress={() => setManualOpen((v) => !v)}>
          <MaterialIcons
            name={manualOpen ? 'expand-less' : 'add-circle-outline'}
            size={18}
            color={colors.primary}
          />
          <Text style={styles.manualToggleText}>
            {manualOpen ? 'Masquer la saisie manuelle' : 'Ajouter un service manuel'}
          </Text>
        </Pressable>

        {manualOpen ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={newTaskLabel}
              onChangeText={setNewTaskLabel}
              placeholder="ex: Vérification panneaux d'affichage"
              placeholderTextColor={colors.outline}
              style={[styles.input, { flex: 1 }]}
              onSubmitEditing={addManualTask}
              returnKeyType="done"
            />
            <Pressable style={styles.addTaskBtn} onPress={addManualTask}>
              <MaterialIcons name="add" size={22} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </View>

      {tasks.length === 0 ? (
        <Text style={styles.emptyText}>Pas encore de tâche. Ajoute-en au moins une.</Text>
      ) : (
        <View style={{ gap: 14 }}>
          {tasksByZone.map((group, gi) => (
            <View key={`${group.zone}-${gi}`} style={{ gap: 6 }}>
              <Text style={styles.zoneSeparator}>{group.zone.toUpperCase()}</Text>
              {group.items.map((t) => {
                const badge = formatFrequencyBadge(t.frequency, t.frequency_count);
                return (
                  <View key={t.localId} style={styles.taskRow}>
                    <MaterialIcons
                      name="check-box-outline-blank"
                      size={20}
                      color={colors.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: colors.onSurface,
                          fontWeight: '500',
                        }}
                      >
                        {t.label}
                      </Text>
                      {!t.catalog_service_id ? (
                        <Text style={styles.manualTag}>SERVICE MANUEL</Text>
                      ) : null}
                    </View>
                    {badge ? (
                      <View style={styles.freqBadge}>
                        <Text style={styles.freqBadgeText}>{badge}</Text>
                      </View>
                    ) : null}
                    <Pressable onPress={() => removeTask(t.localId)} style={styles.deleteBtn}>
                      <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      <ChecklistPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        alreadySelectedIds={alreadySelectedIds}
        onConfirm={(services) => addCatalogServices(services)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  helper: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 4 },
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
  emptyText: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    paddingVertical: 12,
    textAlign: 'center',
  },
});
