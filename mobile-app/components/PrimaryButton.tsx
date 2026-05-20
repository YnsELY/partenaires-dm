import React from 'react';
import { Pressable, Text, StyleSheet, View, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radii, typography } from '../constants/theme';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: 'filled' | 'outline' | 'ghost' | 'danger';
  icon?: keyof typeof MaterialIcons.glyphMap;
  trailingIcon?: keyof typeof MaterialIcons.glyphMap;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

export function PrimaryButton({
  label,
  onPress,
  variant = 'filled',
  icon,
  trailingIcon,
  style,
  textStyle,
  disabled,
  size = 'md',
}: Props) {
  const heightMap = { sm: 44, md: 52, lg: 60 };

  const renderInner = () => (
    <View style={styles.inner}>
      {icon ? <MaterialIcons name={icon} size={20} color={textColor(variant)} /> : null}
      <Text style={[styles.label, { color: textColor(variant) }, textStyle]}>{label}</Text>
      {trailingIcon ? (
        <MaterialIcons name={trailingIcon} size={20} color={textColor(variant)} />
      ) : null}
    </View>
  );

  if (variant === 'filled') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.btnWrap,
          { height: heightMap[size], opacity: pressed ? 0.92 : 1 },
          style,
        ]}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryContainer]}
          style={[styles.fill, { height: heightMap[size] }]}
        >
          {renderInner()}
        </LinearGradient>
      </Pressable>
    );
  }

  if (variant === 'danger') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.fill,
          { backgroundColor: '#dc2626', height: heightMap[size], opacity: pressed ? 0.92 : 1 },
          style,
        ]}
      >
        {renderInner()}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.fill,
        {
          height: heightMap[size],
          backgroundColor: variant === 'ghost' ? 'transparent' : colors.surfaceContainerLow,
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: 'rgba(196, 197, 211, 0.5)',
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {renderInner()}
    </Pressable>
  );
}

const textColor = (variant: NonNullable<Props['variant']>) =>
  variant === 'filled' || variant === 'danger' ? '#fff' : colors.primary;

const styles = StyleSheet.create({
  btnWrap: {
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    ...typography.label,
    fontSize: 12,
  },
});
