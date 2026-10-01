import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { getBiometricsEnabled, setBiometricsEnabled } from '@/lib/settings';
import { getInitials } from '@/lib/format';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  const theme = useTheme();
  const [biometrics, setBiometricsState] = useState<boolean>();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    getBiometricsEnabled().then(setBiometricsState);
  }, []);

  const toggleBiometrics = async (value: boolean) => {
    setBiometricsState(value);
    await setBiometricsEnabled(value);
  };

  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } catch {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  const employee = profile?.employee;
  const branch = profile?.branch;
  const shift = profile?.shift;

  const initials = getInitials(employee?.full_name);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <ThemedView type="backgroundElement" style={styles.avatar}>
            <ThemedText type="subtitle">{initials}</ThemedText>
          </ThemedView>
          <ThemedText style={styles.name}>{employee?.full_name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Código: {employee?.code}
          </ThemedText>
        </View>

        <ThemedView type="backgroundElement" style={styles.card}>
          <InfoRow icon="business" label="Sucursal" value={branch?.name ?? 'Sin asignar'} />
          {branch?.address ? <InfoRow icon="location" label="Dirección" value={branch.address} /> : null}
          {shift ? (
            <InfoRow
              icon="time"
              label="Turno"
              value={`${shift.name} (${shift.start_time} - ${shift.end_time})`}
            />
          ) : null}
          <InfoRow
            icon="shield-checkmark"
            label="Rol"
            value={employee?.role === 'admin' ? 'Administrador' : employee?.role === 'hr' ? 'Recursos humanos' : 'Empleado'}
          />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <ThemedText type="smallBold">Usar biometría al checar</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Pide huella o Face ID antes de registrar tu asistencia.
              </ThemedText>
            </View>
            <Switch
              value={biometrics ?? false}
              onValueChange={toggleBiometrics}
              trackColor={{ false: theme.backgroundSelected, true: '#2F5F96' }}
              thumbColor="#ffffff"
            />
          </View>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
          Checador v{Constants.expoConfig?.version ?? '1.0.0'}
        </ThemedText>

        <PrimaryButton title="Cerrar sesión" onPress={handleSignOut} variant="danger" loading={signingOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color="#2F5F96" />
      <View style={styles.infoText}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="smallBold">{value}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  identity: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
  },
  card: {
    borderRadius: 20,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  infoText: {
    flex: 1,
    gap: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  version: {
    textAlign: 'center',
  },
});
