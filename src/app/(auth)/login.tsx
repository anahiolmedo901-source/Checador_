import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { isSupabaseConfigured } from '@/lib/env';
import { getLastUserCode, setLastUserCode } from '@/lib/settings';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [nip, setNip] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLastUserCode().then((last) => {
      if (last) setCode(last);
    });
  }, []);

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn(code, nip);
      await setLastUserCode(code.trim().toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.setupCard}>
          <ThemedText type="smallBold">Configuración pendiente</ThemedText>
          <ThemedText type="small">
            Copia {'.env.example'} a {'.env'} y agrega EXPO_PUBLIC_SUPABASE_URL y
            EXPO_PUBLIC_SUPABASE_ANON_KEY, luego reinicia la app.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              Checador
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Registra tu asistencia con tu código y NIP.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <Text style={[styles.label, { color: theme.text }]}>Código de empleado</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.replace(/\s+/g, '').toUpperCase())}
              placeholder="EJ: EMP001"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[
                styles.input,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
            />

            <Text style={[styles.label, { color: theme.text }]}>NIP</Text>
            <TextInput
              value={nip}
              onChangeText={setNip}
              placeholder="Tu NIP"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              onSubmitEditing={handleSubmit}
              style={[
                styles.input,
                { backgroundColor: theme.backgroundElement, color: theme.text },
              ]}
            />
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <PrimaryButton
            title="Entrar"
            onPress={handleSubmit}
            loading={submitting}
            disabled={code.length === 0 || nip.length === 0}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 24,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  form: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    borderRadius: 16,
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 18,
    paddingVertical: 16,
    letterSpacing: 1,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(229, 72, 77, 0.12)',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: '#B93A3A',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  setupCard: {
    margin: 24,
    padding: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 72, 77, 0.1)',
    gap: 8,
  },
});