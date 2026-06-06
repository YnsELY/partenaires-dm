import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Avatar } from '../../../components/Avatar';
import { ConversationRow } from '../../../components/ConversationRow';
import { colors, radii, responsive, shadows, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useConversations } from '../../../hooks/useConversations';
import { useAdminAgents } from '../../../hooks/useAdminAgents';
import { useAdminClientUsers } from '../../../hooks/useAdminClientUsers';

type Contact = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: 'agent' | 'client';
};

export default function AdminMessages() {
  const { profile } = useAuth();
  const { conversations, loading, refresh, openConversationWith, openConversationWithClient } =
    useConversations();
  const { agents } = useAdminAgents();
  const { users: clientUsers } = useAdminClientUsers({ scope: 'all' });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [opening, setOpening] = useState(false);

  const initials = useMemo(
    () =>
      (profile?.full_name ?? '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join('') || 'A',
    [profile?.full_name]
  );

  const contacts = useMemo<Contact[]>(() => {
    const agentContacts: Contact[] = agents.map((a) => ({
      id: a.id,
      full_name: a.full_name ?? null,
      email: a.email ?? null,
      role: 'agent',
    }));
    const clientContacts: Contact[] = clientUsers.map((c) => ({
      id: c.id,
      full_name: c.full_name ?? null,
      email: c.email ?? null,
      role: 'client',
    }));
    return [...agentContacts, ...clientContacts].sort((a, b) =>
      (a.full_name ?? '').localeCompare(b.full_name ?? '', 'fr')
    );
  }, [agents, clientUsers]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        (c.full_name ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const handlePickContact = useCallback(
    async (contact: Contact) => {
      setOpening(true);
      const id =
        contact.role === 'agent'
          ? await openConversationWith(contact.id)
          : await openConversationWithClient(contact.id);
      setOpening(false);
      setPickerOpen(false);
      setSearch('');
      if (id) router.push({ pathname: '/(admin)/conversation/[id]', params: { id } });
    },
    [openConversationWith, openConversationWithClient]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Messages"
        leadingAvatar={<Avatar size={32} initials={initials} />}
        rightIcon="edit"
        onRightPress={() => setPickerOpen(true)}
      />

      {loading && conversations.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="forum" size={56} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Aucune conversation</Text>
          <Text style={styles.emptySubtitle}>
            Démarre une discussion avec un agent depuis le bouton{' '}
            <Text style={{ fontWeight: '700' }}>+</Text>.
          </Text>
          <Pressable style={styles.startBtn} onPress={() => setPickerOpen(true)}>
            <MaterialIcons name="edit" size={18} color="#fff" />
            <Text style={styles.startBtnText}>Nouvelle conversation</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            paddingHorizontal: responsive.hPadding,
            paddingTop: 12,
            paddingBottom: 140,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <ConversationRow
              name={item.partner?.full_name ?? (item.agent_id ? 'Agent' : 'Client')}
              role={item.partner?.role ?? (item.agent_id ? 'agent' : 'client')}
              preview={item.last_message_preview}
              lastMessageAt={item.last_message_at}
              unread={item.unread_count}
              onPress={() =>
                router.push({ pathname: '/(admin)/conversation/[id]', params: { id: item.id } })
              }
            />
          )}
        />
      )}

      {conversations.length > 0 ? (
        <Pressable style={styles.fab} onPress={() => setPickerOpen(true)}>
          <MaterialIcons name="edit" size={22} color="#fff" />
        </Pressable>
      ) : null}

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => { setPickerOpen(false); setSearch(''); }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => { setPickerOpen(false); setSearch(''); }}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle conversation</Text>
              <Pressable
                onPress={() => { setPickerOpen(false); setSearch(''); }}
                style={styles.closeBtn}
              >
                <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
            <View style={styles.searchWrap}>
              <MaterialIcons name="search" size={18} color={colors.outline} />
              <TextInput
                placeholder="Rechercher un agent ou un client…"
                placeholderTextColor={colors.outline}
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
                autoFocus
              />
            </View>
            {filteredContacts.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <Text style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>
                  Aucun contact ne correspond.
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(c) => c.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 24, gap: 6 }}
                renderItem={({ item }) => {
                  const inits =
                    (item.full_name ?? '')
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((s) => s[0]?.toUpperCase())
                      .join('') || '?';
                  return (
                    <Pressable
                      onPress={() => handlePickContact(item)}
                      disabled={opening}
                      style={styles.agentRow}
                    >
                      <Avatar
                        initials={inits}
                        size={40}
                        variant={item.role === 'client' ? 'primary' : 'secondary'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.agentName}>{item.full_name ?? 'Sans nom'}</Text>
                        {item.email ? (
                          <Text style={styles.agentEmail} numberOfLines={1}>
                            {item.email}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[
                        styles.roleBadge,
                        item.role === 'client' ? styles.roleBadgeClient : styles.roleBadgeAgent,
                      ]}>
                        <Text style={styles.roleBadgeText}>
                          {item.role === 'client' ? 'Client' : 'Agent'}
                        </Text>
                      </View>
                      {opening ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                      ) : (
                        <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
                      )}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: responsive.hPadding,
    paddingBottom: 100,
    gap: 16,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { ...typography.h2, color: colors.primary, textAlign: 'center' },
  emptySubtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.lg,
    marginTop: 8,
    ...shadows.fab,
  },
  startBtnText: { color: '#fff', fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: responsive.hPadding,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,28,33,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: responsive.hPadding,
    paddingTop: 8,
    paddingBottom: 16,
    maxHeight: '80%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant,
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { ...typography.h3, color: colors.primary },
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
  searchInput: { flex: 1, fontSize: 14, color: colors.onSurface, paddingVertical: 8 },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  agentName: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
  agentEmail: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginRight: 4,
  },
  roleBadgeAgent: { backgroundColor: 'rgba(0, 99, 152, 0.12)' },
  roleBadgeClient: { backgroundColor: 'rgba(0, 35, 111, 0.10)' },
  roleBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
});
