import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';

type Props = {
  bioAvailable: boolean;
  bioError: string | null;
  onUseBiometric: () => void;
  onSkipBiometric: () => void;
};

export function BiometricStep({ bioAvailable, bioError, onUseBiometric, onSkipBiometric }: Props) {
  return (
    <View style={styles.centerContent}>
      <Ionicons name="finger-print" size={72} color="#2F5F96" />
      <ThemedText type="subtitle" style={styles.centerTitle}>
        Verificación biométrica
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerHint}>
        Usa tu huella o Face ID para confirmar que eres tú.
      </ThemedText>
      {bioError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{bioError}</Text>
        </View>
      )}
      {bioAvailable && (
        <PrimaryButton title="Usar biometría" onPress={onUseBiometric} style={styles.wide} />
      )}
      <PrimaryButton
        title="Continuar sin biometría"
        onPress={onSkipBiometric}
        variant="secondary"
        style={styles.wide}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  centerTitle: {
    textAlign: 'center',
  },
  centerHint: {
    textAlign: 'center',
  },
  wide: {
    alignSelf: 'stretch',
  },
  errorBox: {
    backgroundColor: 'rgba(229, 72, 77, 0.16)',
    borderRadius: 12,
    padding: 14,
    alignSelf: 'stretch',
  },
  errorText: {
    color: '#B93A3A',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});