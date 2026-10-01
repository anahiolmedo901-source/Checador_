import { getSecureValue, setSecureValue } from '@/lib/storage';

const BIOMETRICS_KEY = 'checador.biometrics_enabled';
const LAST_LOGIN_KEY = 'checador.last_user_code';

export async function getBiometricsEnabled(): Promise<boolean> {
  const value = await getSecureValue(BIOMETRICS_KEY);
  return value === '1';
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  await setSecureValue(BIOMETRICS_KEY, enabled ? '1' : '0');
}

export async function setLastUserCode(code: string): Promise<void> {
  await setSecureValue(LAST_LOGIN_KEY, code);
}

export async function getLastUserCode(): Promise<string | null> {
  return getSecureValue(LAST_LOGIN_KEY);
}

