import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { colors, radii, responsive, typography } from '../constants/theme';
import {
  LEGAL_DOCUMENTS,
  LegalBlock,
  LegalDocumentId,
} from '../constants/legal';

export default function LegalScreen() {
  const params = useLocalSearchParams<{ doc?: string }>();
  const initial = useMemo<LegalDocumentId>(() => {
    const found = LEGAL_DOCUMENTS.find((d) => d.id === params.doc);
    return found?.id ?? 'mentions';
  }, [params.doc]);

  const [active, setActive] = useState<LegalDocumentId>(initial);
  const doc = LEGAL_DOCUMENTS.find((d) => d.id === active) ?? LEGAL_DOCUMENTS[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header title="Informations légales" onBack={() => router.back()} hideRight />

      {/* Sélecteur de document */}
      <View style={styles.segment}>
        {LEGAL_DOCUMENTS.map((d) => {
          const selected = d.id === active;
          return (
            <Pressable
              key={d.id}
              style={[styles.segmentBtn, selected && styles.segmentBtnActive]}
              onPress={() => setActive(d.id)}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]} numberOfLines={1}>
                {d.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 8,
          paddingBottom: 60,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.docTitle}>{doc.title}</Text>
        <Text style={styles.updated}>Dernière mise à jour : {doc.updated}</Text>

        {doc.blocks.map((block, i) => (
          <Block key={`${doc.id}-${i}`} block={block} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.type === 'h2') {
    return <Text style={styles.h2}>{block.text}</Text>;
  }
  if (block.type === 'li') {
    return (
      <View style={styles.liRow}>
        <View style={styles.bullet} />
        <Text style={styles.liText}>{block.text}</Text>
      </View>
    );
  }
  return <Text style={styles.p}>{block.text}</Text>;
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    marginHorizontal: responsive.hPadding,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  segmentTextActive: { color: '#fff' },
  docTitle: { ...typography.h2, color: colors.primary, marginTop: 8 },
  updated: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
  },
  h2: {
    ...typography.h3,
    color: colors.onSurface,
    marginTop: 22,
    marginBottom: 8,
  },
  p: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.onSurfaceVariant,
    marginTop: 6,
  },
  liRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    paddingRight: 4,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  liText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: colors.onSurfaceVariant,
  },
});
