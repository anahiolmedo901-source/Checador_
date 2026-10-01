import * as LocalAuthentication from 'expo-local-authentication';

export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

export async function authenticateWithBiometrics(message: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: message,
    cancelLabel: 'Cancelar',
  });
  return result.success;
}