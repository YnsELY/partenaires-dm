import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../constants/theme';

export type BadgeVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral';

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  withDot?: boolean;
  small?: boolean;
};

const VARIANT_BG: Record<BadgeVariant, string> = {
  primary: 'rgba(0, 35, 111, 0.10)',
  secondary: 'rgba(0, 99, 152, 0.10)',
  success: 'rgba(22, 163, 74, 0.12)',
  warning: 'rgba(245, 158, 11, 0.16)',
  error: 'rgba(186, 26, 26, 0.10)',
  neutral: '#e5e8ef',
};

const VARIANT_FG: Record<BadgeVariant, string> = {
  primary: colors.primary,
  secondary: colors.secondary,
  success: '#15803d',
  warning: '#b45309',
  error: colors.error,
  neutral: colors.onSurfaceVariant,
};

export function Badge({ label, variant = 'primary', withDot, small }: BadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: VARIANT_BG[variant] },
        small && styles.small,
      ]}
    >
      {withDot ? (
        <View style={[styles.dot, { backgroundColor: VARIANT_FG[variant] }]} />
      ) : null}
      <Text
        style={[
          typography.labelSm,
          { color: VARIANT_FG[variant], fontSize: small ? 9 : 10 },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
