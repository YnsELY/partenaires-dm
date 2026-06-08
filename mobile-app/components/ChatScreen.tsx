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
  Modal,
  Alert,
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

const REPORT_REASONS = [
  { key: 'harassment', label: 'Harcèlement' },
  { key: 'spam', label: 'Spam' },
  { key: 'inappropriate', label: 'Contenu inapproprié' },
  { key: 'other', label: 'Autre' },
] as const;

type ReportReason = typeof REPORT_REASONS[number]['key'];

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

  // Modération
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [moderating, setModerating] = useState(false);

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

  // Vérifie si l'interlocuteur est déjà bloqué
  useEffect(() => {
    if (!userId || !partner?.id) return;
    supabase
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', userId)
      .eq('blocked_id', partner.id)
      .maybeSingle()
      .then(({ data }) => setIsBlocked(!!data));
  }, [userId, partner?.id]);

  const partnerName =
    partner?.full_name ??
    (partner?.role === 'admin'
      ? 'Administration'
      : partner?.role === 'client'
      ? 'Client'
      : 'Agent');

  const initials =
    partnerName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';

  const handleBlockToggle = useCallback(() => {
    if (!partner?.id || !userId) return;
    Alert.alert(
      isBlocked ? `Débloquer ${partnerName}` : `Bloquer ${partnerName}`,
      isBlocked
        ? `Voulez-vous débloquer ${partnerName} ?`
        : `Voulez-vous bloquer ${partnerName} ? Vous ne recevrez plus ses messages.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: isBlocked ? 'Débloquer' : 'Bloquer',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setModerating(true);
            setMenuVisible(false);
            if (isBlocked) {
              await supabase
                .from('blocked_users')
                .delete()
                .eq('blocker_id', userId)
                .eq('blocked_id', partner.id);
              setIsBlocked(false);
            } else {
              await supabase
                .from('blocked_users')
                .insert({ blocker_id: userId, blocked_id: partner.id });
              setIsBlocked(true);
            }
            setModerating(false);
          },
        },
      ]
    );
  }, [isBlocked, partner?.id, userId, partnerName]);

  const handleSendReport = useCallback(async () => {
    if (!partner?.id || !userId || !reportReason) return;
    setModerating(true);
    const { error } = await supabase.from('user_reports').insert({
      reporter_id: userId,
      reported_id: partner.id,
      reason: reportReason,
      details: reportDetails.trim() || null,
    });
    setModerating(false);
    if (error) {
      Alert.alert('Erreur', "Impossible d'envoyer le signalement. Réessaie.");
      return;
    }
    setReportVisible(false);
    setReportReason(null);
    setReportDetails('');
    Alert.alert('Signalement envoyé', 'Merci, notre équipe va examiner ce signalement.');
  }, [partner?.id, userId, reportReason, reportDetails]);

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
    return result.reverse();
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input;
    if (!text.trim()) return;
    setInput('');
    await send(text);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [input, send]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Header
        title={partnerName}
        onBack={() => router.back()}
        leadingAvatar={<Avatar size={32} initials={initials} />}
        rightIcon="more-vert"
        onRightPress={() => setMenuVisible(true)}
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

      {/* Menu de modération (bottom sheet) */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuVisible(false)} />
        <View style={styles.menuSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{partnerName}</Text>

          <Pressable
            style={styles.menuItem}
            onPress={() => {
              setMenuVisible(false);
              setReportVisible(true);
            }}
          >
            <View style={[styles.menuItemIcon, styles.menuItemIconWarn]}>
              <MaterialIcons name="flag" size={20} color="#E65100" />
            </View>
            <Text style={styles.menuItemLabel}>Signaler {partnerName}</Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.outlineVariant} />
          </Pressable>

          <Pressable
            style={[styles.menuItem, moderating && styles.menuItemDisabled]}
            onPress={handleBlockToggle}
            disabled={moderating}
          >
            <View style={[styles.menuItemIcon, styles.menuItemIconDanger]}>
              <MaterialIcons
                name={isBlocked ? 'lock-open' : 'block'}
                size={20}
                color="#C62828"
              />
            </View>
            <Text style={[styles.menuItemLabel, styles.menuItemLabelDanger]}>
              {isBlocked ? `Débloquer ${partnerName}` : `Bloquer ${partnerName}`}
            </Text>
          </Pressable>

          <Pressable style={styles.menuCancelBtn} onPress={() => setMenuVisible(false)}>
            <Text style={styles.menuCancelLabel}>Annuler</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Modal de signalement */}
      <Modal
        visible={reportVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReportVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setReportVisible(false);
            setReportReason(null);
            setReportDetails('');
          }}
        />
        <View style={styles.reportSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Signaler {partnerName}</Text>
          <Text style={styles.reportSubtitle}>
            Pourquoi signalez-vous cet utilisateur ?
          </Text>

          <View style={styles.reasonList}>
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r.key}
                style={[styles.reasonRow, reportReason === r.key && styles.reasonRowSelected]}
                onPress={() => setReportReason(r.key)}
              >
                <View
                  style={[
                    styles.reasonRadio,
                    reportReason === r.key && styles.reasonRadioSelected,
                  ]}
                >
                  {reportReason === r.key && <View style={styles.reasonRadioDot} />}
                </View>
                <Text
                  style={[
                    styles.reasonLabel,
                    reportReason === r.key && styles.reasonLabelSelected,
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={reportDetails}
            onChangeText={setReportDetails}
            placeholder="Détails supplémentaires (optionnel)"
            placeholderTextColor={colors.outline}
            style={styles.reportDetailsInput}
            multiline
            maxLength={500}
          />

          <View style={styles.reportActions}>
            <Pressable
              style={styles.reportCancelBtn}
              onPress={() => {
                setReportVisible(false);
                setReportReason(null);
                setReportDetails('');
              }}
            >
              <Text style={styles.reportCancelLabel}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[
                styles.reportSubmitBtn,
                (!reportReason || moderating) && styles.reportSubmitDisabled,
              ]}
              onPress={handleSendReport}
              disabled={!reportReason || moderating}
            >
              {moderating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.reportSubmitLabel}>Envoyer</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
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

  // — Modals —
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  // Menu de modération
  menuSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: responsive.hPadding,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.outlineVariant,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: radii.md,
  },
  menuItemDisabled: { opacity: 0.5 },
  menuItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemIconWarn: { backgroundColor: '#FFF3E0' },
  menuItemIconDanger: { backgroundColor: '#FFEBEE' },
  menuItemLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.onSurface,
    fontWeight: '500',
  },
  menuItemLabelDanger: { color: '#C62828' },
  menuCancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.md,
  },
  menuCancelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  // Modal signalement
  reportSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: responsive.hPadding,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  reportSubtitle: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 16,
  },
  reasonList: { gap: 6, marginBottom: 14 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.3)',
    backgroundColor: colors.surfaceContainerLowest,
  },
  reasonRowSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(0, 35, 111, 0.04)',
  },
  reasonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonRadioSelected: { borderColor: colors.primary },
  reasonRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  reasonLabel: { fontSize: 15, color: colors.onSurface },
  reasonLabelSelected: { color: colors.primary, fontWeight: '600' },
  reportDetailsInput: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.onSurface,
    maxHeight: 80,
    marginBottom: 16,
  },
  reportActions: {
    flexDirection: 'row',
    gap: 10,
  },
  reportCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.md,
  },
  reportCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  reportSubmitBtn: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
  },
  reportSubmitDisabled: { backgroundColor: colors.outlineVariant },
  reportSubmitLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
