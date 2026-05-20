import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, typography } from '../constants/theme';

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  badge?: string;
};

export function SectionTitle({ title, actionLabel, onAction, badge }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {actionLabel ? (
        <Pressable onPress={onAction}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { ...typography.h3, color: colors.primary, fontWeight: '700' },
  action: { color: colors.secondary, fontSize: 13, fontWeight: '600' },
  badge: {
    backgroundColor: 'rgba(186, 26, 26, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeTxt: { color: colors.error, fontSize: 11, fontWeight: '700' },
});
