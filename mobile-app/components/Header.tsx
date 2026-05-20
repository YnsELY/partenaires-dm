import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../constants/theme';

type HeaderProps = {
  title: string;
  onBack?: () => void;
  rightIcon?: keyof typeof MaterialIcons.glyphMap;
  onRightPress?: () => void;
  /** Si true, n'affiche rien à droite (pas même la cloche par défaut). */
  hideRight?: boolean;
  leadingAvatar?: React.ReactNode;
  centerTitle?: boolean;
  style?: ViewStyle;
};

export function Header({
  title,
  onBack,
  rightIcon,
  onRightPress,
  hideRight,
  leadingAvatar,
  centerTitle,
  style,
}: HeaderProps) {
  const showRight = !hideRight && !!rightIcon;
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.iconBtn}>
            <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
          </Pressable>
        ) : null}
        {leadingAvatar}
        {!centerTitle ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      {centerTitle ? (
        <Text style={[styles.title, styles.centerTitle]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {showRight ? (
        <Pressable onPress={onRightPress} style={styles.iconBtn}>
          <MaterialIcons name={rightIcon!} size={24} color={colors.primary} />
        </Pressable>
      ) : (
        // Placeholder pour conserver l'alignement central du titre
        <View style={styles.iconBtn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(247, 249, 255, 0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 197, 211, 0.18)',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.primary,
    fontWeight: '700',
    flexShrink: 1,
  },
  centerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    pointerEvents: 'none',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
