import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, responsive, typography } from '../constants/theme';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuth } from '../contexts/AuthContext';
import { Role } from '../lib/supabase';

type Mode = 'signin' | 'signup';

const ROLES: { value: Role; label: string; icon: keyof typeof MaterialIcons.glyphMap; description: string }[] = [
  { value: 'agent', label: 'Agent', icon: 'engineering', description: 'Documente les missions sur le terrain.' },
  { value: 'client', label: 'Client', icon: 'apartment', description: 'Consulte les rapports et photos de tes sites.' },
  { value: 'admin', label: 'Admin', icon: 'admin-panel-settings', description: 'Pilote les équipes, sites et validations.' },
];

export default function LoginScreen() {
  const { session, profile, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');

  // Champs partagés
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Champs signup
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('agent');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirection post-auth
  useEffect(() => {
    if (loading) return;
    if (!session || !profile) return;
    if (profile.role === 'agent') router.replace('/(agent)/(tabs)/home');
    else if (profile.role === 'admin') router.replace('/(admin)/(tabs)/home');
    else if (profile.role === 'client') router.replace('/(client)/(tabs)/home');
  }, [session, profile, loading]);

  const onSignIn = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Email et mot de passe requis.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      setError(e?.message ?? 'Connexion impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const onSignUp = async () => {
    setError(null);
    if (!fullName.trim()) return setError('Le nom complet est requis.');
    if (!email.trim()) return setError("L'email est requis.");
    if (password.length < 6) return setError('Le mot de passe doit faire au moins 6 caractères.');
    setSubmitting(true);
    try {
      await signUp({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        phone: phone.trim(),
        role,
      });
    } catch (e: any) {
      setError(e?.message ?? "Inscription impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  // Pendant l'auto-restore de session, on évite de flasher le formulaire
  if (loading || (session && !profile)) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <Image source={require('../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.welcome}>Bienvenue</Text>
            <Text style={styles.subtitle}>
              Accédez à votre espace chantier en toute sécurité.
            </Text>
          </View>

          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => {
                setMode('signin');
                setError(null);
              }}
              style={[styles.toggleBtn, mode === 'signin' && styles.toggleBtnActive]}
            >
              <Text
                style={[
                  styles.toggleText,
                  mode === 'signin' && styles.toggleTextActive,
                ]}
              >
                CONNEXION
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMode('signup');
                setError(null);
              }}
              style={[styles.toggleBtn, mode === 'signup' && styles.toggleBtnActive]}
            >
              <Text
                style={[
                  styles.toggleText,
                  mode === 'signup' && styles.toggleTextActive,
                ]}
              >
                INSCRIPTION
              </Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {mode === 'signup' ? (
            <>
              <FieldLabel label="Nom complet" />
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Jean Dupont"
                placeholderTextColor={colors.outline}
                style={styles.input}
                autoCapitalize="words"
              />

              <FieldLabel label="Téléphone (optionnel)" />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+33 6 00 00 00 00"
                placeholderTextColor={colors.outline}
                style={styles.input}
                keyboardType="phone-pad"
              />
            </>
          ) : null}

          <FieldLabel label="Email" />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="vous@exemple.fr"
            placeholderTextColor={colors.outline}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <FieldLabel label="Mot de passe" />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.outline}
            style={styles.input}
            secureTextEntry
          />

          {mode === 'signup' ? (
            <>
              <FieldLabel label="Je suis" />
              <View style={styles.roleGrid}>
                {ROLES.map((r) => {
                  const selected = r.value === role;
                  return (
                    <Pressable
                      key={r.value}
                      onPress={() => setRole(r.value)}
                      style={[styles.roleCard, selected && styles.roleCardActive]}
                    >
                      <LinearGradient
                        colors={
                          selected
                            ? [colors.primary, colors.primaryContainer]
                            : [colors.surfaceContainerLow, colors.surfaceContainerLow]
                        }
                        style={styles.roleIcon}
                      >
                        <MaterialIcons
                          name={r.icon}
                          size={22}
                          color={selected ? '#fff' : colors.primary}
                        />
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.roleLabel,
                            selected && { color: colors.primary },
                          ]}
                        >
                          {r.label}
                        </Text>
                        <Text style={styles.roleDescription} numberOfLines={2}>
                          {r.description}
                        </Text>
                      </View>
                      <MaterialIcons
                        name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={22}
                        color={selected ? colors.primary : colors.outline}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <View style={{ marginTop: 22 }}>
            <PrimaryButton
              label={mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
              size="lg"
              onPress={mode === 'signin' ? onSignIn : onSignUp}
              disabled={submitting}
              icon={mode === 'signin' ? 'login' : 'person-add'}
            />
            {submitting ? (
              <ActivityIndicator
                color={colors.primary}
                style={{ position: 'absolute', alignSelf: 'center', top: 18 }}
              />
            ) : null}
          </View>

          <Pressable
            onPress={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              setError(null);
            }}
            style={styles.switchLink}
          >
            <Text style={styles.switchText}>
              {mode === 'signin'
                ? "Pas encore de compte ? S'inscrire"
                : 'Déjà un compte ? Se connecter'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: {
    paddingHorizontal: responsive.hPadding,
    paddingVertical: 32,
    maxWidth: responsive.isTablet ? 520 : undefined,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', marginBottom: 28 },
  logoImage: {
    width: 140,
    height: 140,
    marginBottom: 18,
  },
  welcome: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 21,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.full,
    padding: 4,
    marginBottom: 22,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: radii.full,
  },
  toggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#181c21',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.onSurfaceVariant,
  },
  toggleTextActive: { color: colors.primary },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(186, 26, 26, 0.10)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    marginBottom: 14,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.onSecondaryContainer,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.onSurface,
  },
  roleGrid: { gap: 10, marginTop: 4 },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  roleCardActive: {
    backgroundColor: '#fff',
    borderColor: colors.primary,
    shadowColor: '#00236f',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleLabel: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  roleDescription: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 1 },
  switchLink: { alignItems: 'center', paddingVertical: 16 },
  switchText: { color: colors.secondary, fontSize: 13, fontWeight: '600' },
});
