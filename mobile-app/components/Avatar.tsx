import React from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { colors } from '../constants/theme';

type AvatarProps = {
  initials?: string;
  size?: number;
  uri?: string;
  variant?: 'primary' | 'secondary' | 'neutral';
};

export function Avatar({ initials = 'JD', size = 36, uri, variant = 'primary' }: AvatarProps) {
  const bg =
    variant === 'primary'
      ? colors.primaryContainer
      : variant === 'secondary'
      ? colors.secondaryContainer
      : colors.surfaceContainerHigh;

  const fontColor = variant === 'neutral' ? colors.primary : colors.onPrimary;
  const fontSize = Math.max(11, Math.floor(size * 0.4));

  if (uri) {
    return (
      <ImageBackground
        source={{ uri }}
        imageStyle={{ borderRadius: size / 2 }}
        style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: bg }}
      />
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={{ color: fontColor, fontSize, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
