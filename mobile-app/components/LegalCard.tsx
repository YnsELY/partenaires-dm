import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from './Card';
import { colors, radii, typography } from '../constants/theme';
import { LEGAL_DOCUMENTS, LegalDocumentId } from '../constants/legal';

const ICONS: Record<LegalDocumentId, keyof typeof MaterialIcons.glyphMap> = {
  mentions: 'gavel',
  cgu: 'description',
  confidentialite: 'privacy-tip',
};

/**
 * Carte « Informations légales » listant les documents (mentions légales,
 * CGV/CGU, confidentialité). Partagée par les écrans compte admin / agent /
 * client. Chaque ligne ouvre l'écran legal sur le bon document.
 */
export function LegalCard() {
  return (
    <Card padding={22}>
      <Text style={styles.cardTitle}>Informations légales</Text>
      <View style={{ gap: 4 }}>
        {LEGAL_DOCUMENTS.map((d, i) => (
          <Pressable
            key={d.id}
            style={({ pressed }) => [
              styles.row,
              i > 0 && styles.rowDivider,
              pressed && { backgroundColor: colors.surfaceContainerLow },
            ]}
            onPress={() => router.push(`/legal?doc=${d.id}`)}
          >
            <View style={styles.rowIcon}>
              <MaterialIcons name={ICONS[d.id]} size={20} color={colors.primary} />
            </View>
            <Text style={styles.rowText}>{d.title}</Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...typography.h3, color: colors.primary, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: radii.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 197, 211, 0.18)',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.onSurface },
});
