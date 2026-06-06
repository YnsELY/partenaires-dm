import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { colors, radii } from '../constants/theme';

type Role = 'admin' | 'agent' | 'client';

type Props = {
  name: string;
  role?: Role | null;
  preview: string | null;
  lastMessageAt: string;
  unread: number;
  onPress: () => void;
};

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  agent: 'Agent',
  client: 'Client',
};

const ROLE_COLORS: Record<Role, { bg: string; text: string }> = {
  admin: { bg: 'rgba(0, 35, 111, 0.10)', text: '#00236F' },
  agent: { bg: 'rgba(2, 120, 100, 0.10)', text: '#027864' },
  client: { bg: 'rgba(180, 100, 0, 0.10)', text: '#A05A00' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function ConversationRow({ name, role, preview, lastMessageAt, unread, onPress }: Props) {
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';

  const roleColor = role ? ROLE_COLORS[role] : null;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Avatar initials={initials} size={48} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.headerLine}>
          <View style={styles.nameRow}>
            {roleColor && role ? (
              <View style={[styles.roleChip, { backgroundColor: roleColor.bg }]}>
                <Text style={[styles.roleText, { color: roleColor.text }]}>
                  {ROLE_LABELS[role]}
                </Text>
              </View>
            ) : null}
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Text style={styles.time}>{formatTime(lastMessageAt)}</Text>
        </View>
        <View style={styles.previewLine}>
          <Text
            style={[styles.preview, unread > 0 && styles.previewUnread]}
            numberOfLines={1}
          >
            {preview ?? 'Aucun message pour le moment'}
          </Text>
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  roleChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    flexShrink: 0,
  },
  roleText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  name: { fontSize: 15, fontWeight: '700', color: colors.onSurface, flex: 1 },
  time: { fontSize: 11, color: colors.onSurfaceVariant, fontWeight: '600' },
  preview: { fontSize: 13, color: colors.onSurfaceVariant, flex: 1 },
  previewUnread: { color: colors.onSurface, fontWeight: '600' },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
