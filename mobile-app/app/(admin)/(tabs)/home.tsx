import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Avatar } from '../../../components/Avatar';
import { Card } from '../../../components/Card';
import { Badge } from '../../../components/Badge';
import { SectionTitle } from '../../../components/SectionTitle';
import { AdminMenuDrawer } from '../../../components/AdminMenuDrawer';
import { colors, radii, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useAdminStats } from '../../../hooks/useAdminStats';
import { useAdminInterventions } from '../../../hooks/useAdminInterventions';
import { useAdminIncidents } from '../../../hooks/useAdminIncidents';
import { incidentDisplay } from '../../../lib/incidentStatus';

export default function AdminHome() {
  const { profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { stats, loading: statsLoading, refresh: refreshStats } = useAdminStats();
  const { items: pending, loading: pendingLoading, refresh: refreshPending } =
    useAdminInterventions({ status: 'pending_validation', limit: 5 });
  // Inclut tous les statuts "actifs" (non clôturés / non validés) pour que
  // l'admin voie aussi les pending_validation à valider.
  const { items: openIncidents, loading: incidentsLoading, refresh: refreshIncidents } =
    useAdminIncidents({
      status: ['open', 'assigned', 'in_progress', 'pending_validation'],
      limit: 10,
    });
  const now = useMemo(() => new Date(), []);
  const { items: upcoming, loading: upcomingLoading, refresh: refreshUpcoming } =
    useAdminInterventions({ from: now, status: 'scheduled', limit: 5 });

  // Initiales conservées pour usage futur si on les remet dans un sous-écran.
  // (Le bouton hamburger a remplacé l'avatar dans le header de la home.)

  const loading = statsLoading || pendingLoading || incidentsLoading || upcomingLoading;

  const refreshAll = () => {
    refreshStats();
    refreshPending();
    refreshIncidents();
    refreshUpcoming();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Les Partenaires DM"
        centerTitle
        leadingAvatar={
          <Pressable onPress={() => setMenuOpen(true)} style={styles.menuBtn} hitSlop={8}>
            <MaterialIcons name="menu" size={26} color={colors.primary} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: responsive.hPadding,
          paddingTop: 18,
          paddingBottom: 120,
          gap: 26,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshAll} tintColor={colors.primary} />
        }
      >
        {/* Actions rapides en tête : nouvelle intervention + nouveau chantier */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            style={[styles.fabAction, { flex: 1 }]}
            onPress={() => router.push('/(admin)/intervention-new')}
          >
            <MaterialIcons name="event" size={20} color="#fff" />
            <Text style={styles.fabActionText}>Planifier intervention</Text>
          </Pressable>
          <Pressable
            style={[styles.fabAction, { flex: 1, backgroundColor: colors.primaryContainer }]}
            onPress={() => router.push('/(admin)/chantier-new')}
          >
            <MaterialIcons name="add-business" size={20} color="#fff" />
            <Text style={styles.fabActionText}>Nouveau chantier</Text>
          </Pressable>
        </View>

        <View>
          <Text style={{ ...typography.h2, color: colors.primary }}>Tableau de bord — Admin</Text>
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 13, marginTop: 4 }}>
            Vue d'ensemble opérationnelle
          </Text>
        </View>

        <View style={styles.kpiGrid}>
          <KpiCard label="STATUT GLOBAL" value={stats.activeSites} subtitle="Chantiers actifs" icon="domain" />
          <KpiCard
            label="RESSOURCES"
            value={stats.deployedAgents}
            subtitle="Agents déployés"
            icon="groups"
            highlighted
          />
          <KpiCard
            label="PÉRIODE"
            value={stats.monthInterventions}
            subtitle="Interventions ce mois"
            icon="fact-check"
          />
        </View>

        <View>
          <SectionTitle
            title="Interventions à valider"
            actionLabel={pending.length > 0 ? 'Tout voir' : undefined}
            onAction={() => router.push('/(admin)/(tabs)/reports')}
          />
          {pending.length === 0 ? (
            <EmptyInline icon="check-circle-outline" text="Tout est à jour, aucune intervention en attente." />
          ) : (
            <View style={{ gap: 10 }}>
              {pending.map((iv) => {
                const initials = (iv.agent?.full_name ?? 'A')
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase())
                  .join('');
                return (
                  <Pressable
                    key={iv.id}
                    style={styles.pendingRow}
                    onPress={() => router.push(`/(admin)/validation?intervention_id=${iv.id}`)}
                  >
                    <Avatar initials={initials} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{ fontSize: 14, fontWeight: '700', color: colors.onSurface }}
                        numberOfLines={1}
                      >
                        {iv.agent?.full_name ?? 'Agent inconnu'}
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: colors.onSurfaceVariant }}
                        numberOfLines={1}
                      >
                        {iv.site?.name ?? 'Site'}
                      </Text>
                    </View>
                    <Badge label="EN ATTENTE" variant="warning" small withDot />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View>
          <SectionTitle
            title="Signalements à traiter"
            badge={openIncidents.length > 0 ? String(openIncidents.length) : undefined}
          />
          {openIncidents.length === 0 ? (
            <EmptyInline icon="security" text="Aucun signalement actif." />
          ) : (
            <View style={{ gap: 10 }}>
              {openIncidents.map((inc) => {
                const display = incidentDisplay(inc.status, 'admin');
                const needsAdminAction =
                  inc.status === 'open' || inc.status === 'pending_validation';
                return (
                  <Pressable
                    key={inc.id}
                    style={styles.incidentRow}
                    onPress={() =>
                      router.push({
                        pathname: '/(admin)/incident/[id]',
                        params: { id: inc.id },
                      })
                    }
                  >
                    <View
                      style={[
                        styles.incidentBar,
                        { backgroundColor: needsAdminAction ? colors.error : colors.warning },
                      ]}
                    />
                    <View style={styles.incidentIcon}>
                      <MaterialIcons
                        name={inc.status === 'pending_validation' ? 'rule' : 'warning'}
                        size={18}
                        color={needsAdminAction ? colors.error : colors.warning}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onSurface }} numberOfLines={1}>
                        {inc.description?.slice(0, 60) ?? 'Signalement sans description'}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 }} numberOfLines={1}>
                        {inc.site?.name ?? 'Site'} •{' '}
                        {new Date(inc.created_at).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </Text>
                    </View>
                    <Badge label={display.label.toUpperCase()} variant={display.variant} small />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View>
          <SectionTitle
            title="Interventions à venir"
            actionLabel={upcoming.length > 0 ? 'Tout voir' : undefined}
            onAction={() => router.push('/(admin)/(tabs)/planning')}
          />
          {upcoming.length === 0 ? (
            <EmptyInline icon="event-available" text="Aucune intervention planifiée pour la suite." />
          ) : (
            <View style={{ gap: 10 }}>
              {upcoming.map((iv) => {
                const date = new Date(iv.scheduled_at);
                const today = new Date();
                const isToday = date.toDateString() === today.toDateString();
                const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <Pressable key={iv.id} style={styles.upcomingRow}>
                    <View style={styles.timeChip}>
                      <Text style={{ color: colors.secondary, fontSize: 12, fontWeight: '700' }}>{time}</Text>
                      <Text style={styles.todayLabel}>
                        {isToday
                          ? "AUJOURD'HUI"
                          : date
                              .toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
                              .toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onSurface }} numberOfLines={1}>
                        {iv.site?.name ?? 'Site'}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }} numberOfLines={1}>
                        Agent : {iv.agent?.full_name ?? 'non assigné'}
                      </Text>
                    </View>
                    <MaterialIcons name="info-outline" size={20} color={colors.outlineVariant} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

      </ScrollView>

      <AdminMenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

function EmptyInline({ icon, text }: { icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  return (
    <Card padding={20} variant="low" noShadow>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <MaterialIcons name={icon} size={28} color={colors.outline} />
        <Text style={{ color: colors.onSurfaceVariant, fontSize: 13, textAlign: 'center' }}>{text}</Text>
      </View>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  icon,
  highlighted,
}: {
  label: string;
  value: number;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  highlighted?: boolean;
}) {
  if (highlighted) {
    return (
      <LinearGradient colors={[colors.primary, colors.primaryContainer]} style={styles.kpiCardHighlight}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={[styles.kpiBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={[styles.kpiLabel, { color: '#fff' }]}>{label}</Text>
          </View>
          <MaterialIcons name={icon} size={22} color="#fff" />
        </View>
        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>{value}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' }}>{subtitle}</Text>
        </View>
      </LinearGradient>
    );
  }
  return (
    <Card style={styles.kpiCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={[styles.kpiBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
          <Text style={[styles.kpiLabel, { color: colors.onSecondaryContainer }]}>{label}</Text>
        </View>
        <MaterialIcons name={icon} size={22} color={colors.outline} />
      </View>
      <View style={{ marginTop: 18 }}>
        <Text style={{ fontSize: 36, fontWeight: '800', color: colors.primary, letterSpacing: -0.5 }}>
          {value}
        </Text>
        <Text style={{ color: colors.onSurfaceVariant, fontSize: 13, fontWeight: '500' }}>{subtitle}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiGrid: { gap: 12 },
  kpiCard: { padding: 18 },
  kpiCardHighlight: {
    padding: 18,
    borderRadius: radii.xl,
    shadowColor: '#00236f',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  kpiBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  kpiLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  incidentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 14,
    paddingLeft: 18,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.20)',
    overflow: 'hidden',
  },
  incidentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.error },
  incidentIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(186, 26, 26, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  timeChip: {
    width: 64,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: 'rgba(100, 186, 254, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(100, 186, 254, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.onSecondaryContainer,
    marginTop: 2,
  },
  fabAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    shadowColor: '#00236f',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  fabActionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
