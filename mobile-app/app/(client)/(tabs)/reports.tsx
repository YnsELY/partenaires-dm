import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Card } from '../../../components/Card';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import {
  useClientInterventions,
  ClientIntervention,
} from '../../../hooks/useClientInterventions';
import { openUrl } from '../../../lib/openUrl';

export default function ClientReports() {
  const { items, loading, refresh } = useClientInterventions({
    status: 'validated',
    recent: true,
    limit: 100,
  });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((iv) => {
      const name = iv.site?.name?.toLowerCase() ?? '';
      const summary = iv.admin_summary?.toLowerCase() ?? '';
      return name.includes(q) || summary.includes(q);
    });
  }, [items, search]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Les Partenaires DM"
        leadingAvatar={
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.brandIcon}
            resizeMode="contain"
          />
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingBottom: 120,
          paddingTop: 16,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />
        }
      >
        <Text style={{ ...typography.h2, color: colors.primary }}>Mes rapports</Text>
        <Text style={styles.subtitle}>
          Consultez et téléchargez les rapports d'intervention validés sur vos sites.
        </Text>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={22} color={colors.onSurfaceVariant} />
            <TextInput
              placeholder="Rechercher un rapport..."
              placeholderTextColor={colors.onSurfaceVariant}
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
            />
          </View>
        </View>

        {loading && filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <Card padding={28} style={{ marginTop: 22 }}>
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="description" size={42} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {search.trim() ? 'Aucun résultat' : 'Aucun rapport disponible'}
              </Text>
              <Text style={styles.emptySub}>
                {search.trim()
                  ? 'Essaie un autre terme de recherche.'
                  : "Vos rapports d'intervention apparaîtront ici une fois validés par l'équipe des Partenaires DM."}
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 14, marginTop: 22 }}>
            {filtered.map((iv) => (
              <ReportCard key={iv.id} intervention={iv} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportCard({ intervention }: { intervention: ClientIntervention }) {
  const date = new Date(intervention.validated_at ?? intervention.scheduled_at);
  const dateStr = date
    .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();

  const open = async () => {
    if (intervention.pdf_url) {
      try {
        await openUrl(intervention.pdf_url);
      } catch (e: any) {
        Alert.alert('Lien indisponible', e?.message ?? 'Le PDF est temporairement inaccessible.');
      }
    } else {
      router.push({
        pathname: '/(client)/intervention/[id]',
        params: { id: intervention.id },
      });
    }
  };

  return (
    <Pressable onPress={open}>
      <Card padding={20} style={{ borderRadius: radii['3xl'] }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <View style={styles.pdfIcon}>
            <MaterialIcons
              name={intervention.pdf_url ? 'picture-as-pdf' : 'description'}
              size={26}
              color={intervention.pdf_url ? colors.error : colors.primary}
            />
          </View>
          <View style={styles.dateChip}>
            <Text style={styles.dateChipText}>{dateStr}</Text>
          </View>
        </View>
        <Text style={styles.reportTitle} numberOfLines={1}>
          {intervention.site?.name ?? 'Site'}
        </Text>
        <Text style={styles.reportSite} numberOfLines={2}>
          {intervention.admin_summary?.trim()
            ? intervention.admin_summary
            : 'Pas de résumé fourni.'}
        </Text>
        <View style={styles.actionRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons
              name={intervention.pdf_url ? 'file-download' : 'visibility'}
              size={18}
              color={colors.primary}
            />
            <Text style={styles.actionText}>
              {intervention.pdf_url ? 'TÉLÉCHARGER LE PDF' : 'VOIR LE RAPPORT'}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brandIcon: {
    width: 36,
    height: 36,
  },
  subtitle: { color: colors.onSurfaceVariant, fontSize: 14, marginTop: 6, lineHeight: 22 },
  searchRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  searchBox: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.onSurface },
  pdfIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChip: {
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dateChipText: { color: colors.onSurfaceVariant, fontSize: 11, fontWeight: '700' },
  reportTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface, marginTop: 14 },
  reportSite: { color: colors.onSurfaceVariant, fontSize: 13, marginTop: 4, lineHeight: 19 },
  actionRow: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionText: { color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  emptyState: { alignItems: 'center', gap: 10 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  emptySub: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
});
