import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radii, responsive, typography } from '../constants/theme';
import { CatalogService } from '../lib/supabase';
import { useCatalog, formatFrequencyBadge } from '../hooks/useCatalog';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (services: CatalogService[]) => void;
  /** IDs des services déjà ajoutés à la checklist — affichés grisés et non cochables. */
  alreadySelectedIds?: Set<string>;
};

/**
 * Bottom-sheet de sélection multiple de services depuis le catalogue
 * de prestations Enedis. Accordéons par catégorie, recherche temps réel,
 * boutons "tout cocher / décocher" par catégorie.
 */
export function ChecklistPicker({
  visible,
  onClose,
  onConfirm,
  alreadySelectedIds,
}: Props) {
  const { categories, loading, error } = useCatalog();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset à l'ouverture
  useEffect(() => {
    if (visible) {
      setSearch('');
      setSelected(new Set());
      // Au premier affichage, on ouvre la première catégorie pour donner
      // un repère visuel sans étouffer l'écran.
      if (categories.length > 0) {
        setExpanded(new Set([categories[0].id]));
      }
    }
  }, [visible, categories]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return categories;
    return categories
      .map((c) => ({
        ...c,
        services: c.services.filter(
          (s) =>
            s.label.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)
        ),
      }))
      .filter((c) => c.services.length > 0);
  }, [categories, q]);

  // Quand on cherche, on déplie tout pour voir les résultats.
  useEffect(() => {
    if (q) {
      setExpanded(new Set(filtered.map((c) => c.id)));
    }
  }, [q, filtered]);

  const toggleCategory = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleService = (id: string) => {
    if (alreadySelectedIds?.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAllInCategory = (services: CatalogService[], check: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of services) {
        if (alreadySelectedIds?.has(s.id)) continue;
        if (check) next.add(s.id);
        else next.delete(s.id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const all: CatalogService[] = [];
    for (const c of categories) {
      for (const s of c.services) {
        if (selected.has(s.id)) all.push(s);
      }
    }
    onConfirm(all);
    onClose();
  };

  const totalSelected = selected.size;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Catalogue des prestations</Text>
              <Text style={styles.subtitle}>
                Coche les services à ajouter à la checklist.
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <MaterialIcons name="search" size={18} color={colors.outline} />
            <TextInput
              placeholder="Rechercher un service ou une catégorie…"
              placeholderTextColor={colors.outline}
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialIcons name="close" size={18} color={colors.outline} />
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <MaterialIcons name="error-outline" size={32} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>
                Aucun résultat pour « {search} ».
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 12, gap: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.map((cat) => {
                const isOpen = expanded.has(cat.id);
                const pickable = cat.services.filter(
                  (s) => !alreadySelectedIds?.has(s.id)
                );
                const allChecked =
                  pickable.length > 0 &&
                  pickable.every((s) => selected.has(s.id));
                return (
                  <View key={cat.id} style={styles.categoryCard}>
                    <Pressable
                      style={styles.categoryHeader}
                      onPress={() => toggleCategory(cat.id)}
                    >
                      <MaterialIcons
                        name={isOpen ? 'expand-less' : 'expand-more'}
                        size={22}
                        color={colors.primary}
                      />
                      <Text style={styles.categoryName}>{cat.name}</Text>
                      <Text style={styles.categoryCount}>
                        {cat.services.length}
                      </Text>
                    </Pressable>

                    {isOpen ? (
                      <View style={styles.categoryBody}>
                        {pickable.length > 0 ? (
                          <Pressable
                            onPress={() =>
                              setAllInCategory(pickable, !allChecked)
                            }
                            style={styles.bulkBtn}
                          >
                            <MaterialIcons
                              name={
                                allChecked
                                  ? 'check-box'
                                  : 'check-box-outline-blank'
                              }
                              size={16}
                              color={colors.primary}
                            />
                            <Text style={styles.bulkBtnText}>
                              {allChecked ? 'Tout décocher' : 'Tout cocher'}
                            </Text>
                          </Pressable>
                        ) : null}

                        {cat.services.map((s) => {
                          const alreadyIn = alreadySelectedIds?.has(s.id) ?? false;
                          const isSelected = selected.has(s.id);
                          const badge = formatFrequencyBadge(
                            s.frequency,
                            s.frequency_count
                          );
                          return (
                            <Pressable
                              key={s.id}
                              onPress={() => toggleService(s.id)}
                              disabled={alreadyIn}
                              style={[
                                styles.serviceRow,
                                alreadyIn && styles.serviceRowDisabled,
                              ]}
                            >
                              <MaterialIcons
                                name={
                                  alreadyIn
                                    ? 'check-circle'
                                    : isSelected
                                    ? 'check-box'
                                    : 'check-box-outline-blank'
                                }
                                size={20}
                                color={
                                  alreadyIn
                                    ? colors.success
                                    : isSelected
                                    ? colors.primary
                                    : colors.outline
                                }
                              />
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={[
                                    styles.serviceLabel,
                                    alreadyIn && styles.serviceLabelDisabled,
                                  ]}
                                >
                                  {s.label}
                                </Text>
                                {s.note ? (
                                  <Text style={styles.serviceNote}>{s.note}</Text>
                                ) : null}
                              </View>
                              {badge ? (
                                <View style={styles.freqBadge}>
                                  <Text style={styles.freqBadgeText}>{badge}</Text>
                                </View>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <Pressable
            onPress={handleConfirm}
            disabled={totalSelected === 0}
            style={[
              styles.confirmBtn,
              totalSelected === 0 && styles.confirmBtnDisabled,
            ]}
          >
            <Text style={styles.confirmBtnText}>
              {totalSelected === 0
                ? 'Sélectionner des services'
                : `Ajouter ${totalSelected} service${totalSelected > 1 ? 's' : ''}`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,28,33,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: responsive.hPadding,
    paddingTop: 8,
    paddingBottom: 16,
    maxHeight: '88%',
    minHeight: '60%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  title: { ...typography.h3, color: colors.primary },
  subtitle: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
    paddingVertical: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
  },
  categoryCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  categoryCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  categoryBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 197, 211, 0.18)',
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  bulkBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  serviceRowDisabled: { opacity: 0.55 },
  serviceLabel: { fontSize: 13, color: colors.onSurface, lineHeight: 18 },
  serviceLabelDisabled: { textDecorationLine: 'line-through' },
  serviceNote: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 2,
    fontStyle: 'italic',
  },
  freqBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surfaceContainer,
    alignSelf: 'center',
  },
  freqBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.4,
  },
  confirmBtn: {
    marginTop: 12,
    height: 50,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: { backgroundColor: colors.outlineVariant },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
});
