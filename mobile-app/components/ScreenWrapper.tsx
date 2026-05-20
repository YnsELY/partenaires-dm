import React from 'react';
import { ScrollView, View, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, responsive } from '../constants/theme';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  withBottomPadding?: boolean;
  contentStyle?: ViewStyle;
  background?: string;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
};

export function ScreenWrapper({
  children,
  scroll = true,
  withBottomPadding = true,
  contentStyle,
  background = colors.background,
  edges = ['top', 'left', 'right'],
}: Props) {
  const bottomPadding = withBottomPadding ? 110 : 24;

  if (!scroll) {
    return (
      <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: background }]}>
        <View style={[styles.flex, contentStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: background }]}>
      <ScrollView
        contentContainerStyle={[
          {
            paddingHorizontal: responsive.hPadding,
            paddingBottom: bottomPadding,
          },
          contentStyle,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
});
