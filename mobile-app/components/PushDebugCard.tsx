import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { colors, radii } from '../constants/theme';
import { usePushNotifications } from '../contexts/PushNotificationsContext';

export function PushDebugCard() {
  const push = usePushNotifications();
  const [sending, setSending] = useState(false);

  if (!__DEV__) return null;

  const send = async () => {
    setSending(true);
    try {
      await push.sendTest();
      Alert.alert('Notification envoyée', 'Vérifie la notification sur cet appareil.');
    } catch (e) {
      Alert.alert('Test impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const tokenLabel = push.expoPushToken
    ? `${push.expoPushToken.slice(0, 24)}…${push.expoPushToken.slice(-8)}`
    : 'Aucun token enregistré';

  return (
    <Card padding={22}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <MaterialIcons name="notifications-active" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notifications push</Text>
          <Text style={styles.subtitle}>Debug development build</Text>
        </View>
        {push.loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.meta}>Permission : {push.permission}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          Token : {tokenLabel}
        </Text>
        {push.error ? <Text style={styles.error}>{push.error}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PrimaryButton
          label="Rafraîchir"
          variant="outline"
          size="sm"
          style={{ flex: 1 }}
          onPress={push.refreshRegistration}
          disabled={push.loading}
        />
        <PrimaryButton
          label={sending ? 'Envoi…' : "M'envoyer un test"}
          size="sm"
          style={{ flex: 1.4 }}
          onPress={send}
          disabled={sending || !push.expoPushToken}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.primary },
  subtitle: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
  statusBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: 12,
    gap: 4,
    marginVertical: 14,
  },
  meta: { fontSize: 12, color: colors.onSurfaceVariant },
  error: { fontSize: 12, color: colors.error, marginTop: 4 },
});
