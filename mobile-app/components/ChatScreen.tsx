import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from './Header';
import { Avatar } from './Avatar';
import { colors, radii, responsive, typography } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { useMessages } from '../hooks/useMessages';
import { supabase, Conversation, Profile, Message } from '../lib/supabase';

type Props = {
  conversationId: string;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Aujourd'hui";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

type Row =
  | { kind: 'message'; message: Message }
  | { kind: 'day'; key: string; label: string };

/**
 * Écran de conversation partagé admin/agent. Charge la conversation +
 * le profil de l'interlocuteur, puis affiche les messages avec mise à
 * jour temps réel via le hook `useMessages` (websocket Supabase).
 */
export function ChatScreen({ conversationId }: Props) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [partner, setPartner] = useState<Pick<
    Profile,
    'id' | 'full_name' | 'avatar_url' | 'role'
  > | null>(null);
  const [loadingHeader, setLoadingHeader] = useState(true);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  const { messages, loading, sending, send } = useMessages(conversationId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: conv, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .maybeSingle();

      if (cancelled || error || !conv) {
        setLoadingHeader(false);
        return;
      }
      setConversation(conv as Conversation);

      const otherId =
        userId === conv.admin_id
          ? (conv.agent_id ?? conv.client_id)
          : conv.admin_id;
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .eq('id', otherId)
        .maybeSingle();

      if (!cancelled) {
        setPartner((prof as any) ?? null);
        setLoadingHeader(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, userId]);

  // Construit la liste avec séparateurs de jour (placés AVANT le bloc du jour
  // — comme la FlatList est inversée, ils apparaissent au-dessus visuellement).
  const rows = useMemo<Row[]>(() => {
    const ordered = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const result: Row[] = [];
    let lastDay = '';
    for (const m of ordered) {
      const day = new Date(m.created_at).toDateString();
      if (day !== lastDay) {
        result.push({ kind: 'day', key: `day-${day}`, label: formatDayLabel(m.created_at) });
        lastDay = day;
      }
      result.push({ kind: 'message', message: m });
    }
    // FlatList inversée → on inverse l'ordre pour que le plus récent soit en bas (offset 0).
    return result.reverse();
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input;
    if (!text.trim()) return;
    setInput('');
    await send(text);
    // En liste inversée, on revient en bas (offset 0).
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [input, send]);

  const partnerName =
    partner?.full_name ??
    (partner?.role === 'admin' ? 'Administration' : partner?.role === 'client' ? 'Client' : 'Agent');
  const initials =
    partnerName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title={partnerName}
        onBack={() => router.back()}
        leadingAvatar={<Avatar size={32} initials={initials} />}
        rightIcon="info-outline"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {loading || loadingHeader ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.iconWrap}>
              <MaterialIcons name="forum" size={48} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Démarre la conversation</Text>
            <Text style={styles.emptySubtitle}>
              Écris ton premier message à {partnerName}.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={rows}
            inverted
            keyExtractor={(r) => (r.kind === 'message' ? r.message.id : r.key)}
            contentContainerStyle={{
              paddingHorizontal: responsive.hPadding,
              paddingTop: 16,
              paddingBottom: 16,
              gap: 6,
            }}
            renderItem={({ item }) => {
              if (item.kind === 'day') {
                return (
                  <View style={styles.daySeparator}>
                    <Text style={styles.dayLabel}>{item.label}</Text>
                  </View>
                );
              }
              const isMine = item.message.sender_id === userId;
              return (
                <View
                  style={[
                    styles.bubbleRow,
                    isMine ? styles.bubbleRowRight : styles.bubbleRowLeft,
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      isMine ? styles.bubbleMine : styles.bubbleTheirs,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
                      ]}
                    >
                      {item.message.body}
                    </Text>
                    <Text
                      style={[
                        styles.bubbleTime,
                        isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs,
                      ]}
                    >
                      {formatTime(item.message.created_at)}
                      {isMine && item.message.read_at ? ' · Lu' : ''}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={styles.composerWrap}>
          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Écris un message…"
              placeholderTextColor={colors.outline}
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!sending}
            />
            <Pressable
              onPress={handleSend}
              disabled={!input.trim() || sending}
              style={[
                styles.sendBtn,
                (!input.trim() || sending) && styles.sendBtnDisabled,
              ]}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialIcons name="send" size={20} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: responsive.hPadding,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { ...typography.h3, color: colors.primary, textAlign: 'center' },
  emptySubtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
  },
  daySeparator: { alignItems: 'center', marginVertical: 8 },
  dayLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    gap: 4,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.3)',
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: colors.onSurface },
  bubbleTime: { fontSize: 10, marginTop: 2 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  bubbleTimeTheirs: { color: colors.onSurfaceVariant },
  composerWrap: {
    paddingHorizontal: responsive.hPadding,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 197, 211, 0.2)',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.3)',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.onSurface,
    maxHeight: 120,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.outlineVariant },
});
