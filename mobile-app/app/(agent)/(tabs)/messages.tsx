import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../../components/Header';
import { Avatar } from '../../../components/Avatar';
import { ConversationRow } from '../../../components/ConversationRow';
import { colors, responsive, typography } from '../../../constants/theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useConversations } from '../../../hooks/useConversations';

export default function AgentMessages() {
  const { profile } = useAuth();
  const { conversations, loading, refresh } = useConversations();

  const initials = useMemo(
    () =>
      (profile?.full_name ?? '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join('') || '?',
    [profile?.full_name]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title="Messages"
        leadingAvatar={<Avatar size={32} initials={initials} variant="secondary" />}
      />

      {loading && conversations.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="chat-bubble-outline" size={56} color={colors.primary} />
          </View>
          <Text style={styles.title}>Aucune conversation</Text>
          <Text style={styles.subtitle}>
            L'administration t'écrira ici lorsqu'il y aura une mise à jour ou une consigne.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            paddingHorizontal: responsive.hPadding,
            paddingTop: 12,
            paddingBottom: 120,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => (
            <ConversationRow
              name={item.partner?.full_name ?? 'Administration'}
              preview={item.last_message_preview}
              lastMessageAt={item.last_message_at}
              unread={item.unread_count}
              onPress={() =>
                router.push({ pathname: '/(agent)/conversation/[id]', params: { id: item.id } })
              }
            />
          )}
        />
      )}
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
  title: { ...typography.h2, color: colors.primary, textAlign: 'center' },
  subtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
});
