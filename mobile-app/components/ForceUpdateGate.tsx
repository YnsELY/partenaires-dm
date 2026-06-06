import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Platform,
  Image,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { supabase, AppConfig } from '../lib/supabase';
import { colors, radii, typography } from '../constants/theme';

/**
 * Compare deux versions semver "x.y.z".
 * Renvoie -1 si a < b, 1 si a > b, 0 si égales. Les segments non numériques
 * (ex: "1.2.0-beta") sont ignorés au-delà du premier nombre.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

const DEFAULT_MESSAGE =
  "Une nouvelle version de l'application est disponible. Mettez-la à jour pour continuer à l'utiliser.";

/**
 * Affiche un écran bloquant (non fermable) quand la version installée est
 * inférieure à `min_supported_version` définie en base (`app_config`).
 * En cas d'erreur réseau ou d'absence de config, on n'affiche RIEN (fail-open)
 * pour ne jamais verrouiller l'app à tort.
 */
export function ForceUpdateGate({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [outdated, setOutdated] = useState(false);

  const check = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (error || !data) return; // fail-open
    const cfg = data as AppConfig;
    const current = Constants.expoConfig?.version ?? '0.0.0';
    setConfig(cfg);
    setOutdated(compareVersions(current, cfg.min_supported_version ?? '0.0.0') < 0);
  }, []);

  useEffect(() => {
    check();
    // Re-vérifie quand l'app revient au premier plan (au cas où l'admin
    // relèverait la version minimale pendant que l'app est ouverte).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const onUpdate = useCallback(() => {
    const url = Platform.OS === 'ios' ? config?.ios_app_url : config?.android_app_url;
    if (url) {
      Linking.openURL(url).catch(() => undefined);
    }
  }, [config]);

  if (!outdated) return <>{children}</>;

  const storeUrl = Platform.OS === 'ios' ? config?.ios_app_url : config?.android_app_url;

  // Overlay plein écran au-dessus de toute l'app, captant tous les touchers.
  return (
    <>
      {children}
      <View style={styles.overlay} pointerEvents="auto">
        <SafeAreaView style={styles.safe}>
          <View style={styles.card}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.iconBadge}>
              <MaterialIcons name="system-update" size={30} color={colors.primary} />
            </View>
            <Text style={styles.title}>Mise à jour requise</Text>
            <Text style={styles.message}>{config?.update_message?.trim() || DEFAULT_MESSAGE}</Text>

            <Pressable style={styles.button} onPress={onUpdate} disabled={!storeUrl}>
              <MaterialIcons name="download" size={20} color="#fff" />
              <Text style={styles.buttonText}>Mettre à jour</Text>
            </Pressable>

            {!storeUrl ? (
              <Text style={styles.hint}>
                Rendez-vous sur le {Platform.OS === 'ios' ? 'App Store' : 'Play Store'} pour
                installer la dernière version.
              </Text>
            ) : null}
          </View>
        </SafeAreaView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    zIndex: 9999,
    elevation: 9999,
  },
  safe: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  card: { alignItems: 'center', gap: 14 },
  logo: { width: 96, height: 96, marginBottom: 4 },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 35, 111, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.h1, color: colors.primary, textAlign: 'center' },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 340,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: radii.lg,
    marginTop: 10,
    alignSelf: 'stretch',
    shadowColor: '#00236f',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
  },
});
