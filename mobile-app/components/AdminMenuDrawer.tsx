import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Avatar } from './Avatar';
import { colors, radii, typography } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';

type Destination = {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  href: Parameters<typeof router.push>[0];
};

const ENTRIES: Destination[] = [
  { label: 'Accueil', icon: 'home', href: '/(admin)/(tabs)/home' },
  { label: 'Clients', icon: 'groups', href: '/(admin)/(tabs)/clients' },
  { label: 'Planning', icon: 'calendar-today', href: '/(admin)/(tabs)/planning' },
  { label: 'Agents', icon: 'badge', href: '/(admin)/(tabs)/agents' },
  { label: 'Messagerie', icon: 'chat-bubble-outline', href: '/(admin)/(tabs)/messages' },
  { label: 'Rapports', icon: 'description', href: '/(admin)/(tabs)/reports' },
  { label: 'Mon compte', icon: 'person-outline', href: '/(admin)/compte' },
];

const WIDTH = Math.min(320, Dimensions.get('window').width * 0.82);

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function AdminMenuDrawer({ visible, onClose }: Props) {
  const { profile } = useAuth();
  const slide = React.useRef(new Animated.Value(-WIDTH)).current;

  React.useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : -WIDTH,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const initials =
    (profile?.full_name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || 'A';

  const navigate = (href: Destination['href']) => {
    onClose();
    // Délai léger pour que l'animation de fermeture démarre avant la nav.
    setTimeout(() => router.push(href), 60);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.panel, { width: WIDTH, transform: [{ translateX: slide }] }]}
          onStartShouldSetResponder={() => true}
        >
          <SafeAreaView edges={['top', 'left', 'bottom']} style={{ flex: 1 }}>
            <View style={styles.identityBlock}>
              <Avatar size={56} initials={initials} />
              <Text style={styles.fullName} numberOfLines={1}>
                {profile?.full_name ?? '—'}
              </Text>
              <Text style={styles.role}>ADMINISTRATEUR</Text>
            </View>

            <ScrollView contentContainerStyle={{ paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
              {ENTRIES.map((e) => (
                <Pressable
                  key={e.label}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: colors.surfaceContainerLow },
                  ]}
                  onPress={() => navigate(e.href)}
                >
                  <View style={styles.rowIcon}>
                    <MaterialIcons name={e.icon} size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.rowText}>{e.label}</Text>
                  <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,28,33,0.45)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  identityBlock: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: 22,
    paddingHorizontal: 20,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 197, 211, 0.18)',
  },
  fullName: { ...typography.h3, color: colors.primary, textAlign: 'center', marginTop: 6 },
  role: { color: colors.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0, 35, 111, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.onSurface },
});
