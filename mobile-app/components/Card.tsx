import React from 'react';
import { View, StyleSheet, ViewStyle, ViewProps } from 'react-native';
import { colors, radii, shadows } from '../constants/theme';

type CardProps = ViewProps & {
  variant?: 'lowest' | 'low' | 'high' | 'primary';
  padding?: number;
  style?: ViewStyle;
  noShadow?: boolean;
  children?: React.ReactNode;
};

export function Card({
  children,
  variant = 'lowest',
  padding = 20,
  noShadow,
  style,
  ...rest
}: CardProps) {
  const bg =
    variant === 'lowest'
      ? colors.surfaceContainerLowest
      : variant === 'low'
      ? colors.surfaceContainerLow
      : variant === 'high'
      ? colors.surfaceContainerHigh
      : colors.primaryContainer;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: bg, padding },
        !noShadow && shadows.card,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(196, 197, 211, 0.18)',
  },
});
