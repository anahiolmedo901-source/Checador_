import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getSecureValue, setSecureValue } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { DeviceInfo } from '@/types';

const DEVICE_ID_KEY = 'checador.device_identifier';

type DevicePlatform = 'android' | 'ios' | 'web';

type DeviceMetadata = {
  identifier: string;
  platform: DevicePlatform;
  model: string | null;
  manufacturer: string | null;
  os_version: string | null;
  app_version: string | null;
};

function toPlatform(os: 'android' | 'ios' | 'web' | 'macos' | 'windows' | 'native'): DevicePlatform {
  if (os === 'ios' || os === 'android') return os;
  return 'web';
}

async function getDeviceIdentifier(): Promise<string> {
  const existing = await getSecureValue(DEVICE_ID_KEY);
  if (existing) return existing;
  const fresh = Crypto.randomUUID();
  await setSecureValue(DEVICE_ID_KEY, fresh);
  return fresh;
}

async function getDeviceMetadata(): Promise<DeviceMetadata> {
  return {
    identifier: await getDeviceIdentifier(),
    platform: toPlatform(Platform.OS),
    model: Device.modelName ?? null,
    manufacturer: Device.manufacturer ?? null,
    os_version: Device.osVersion ?? null,
    app_version: Constants.expoConfig?.version ?? null,
  };
}

/**
 * Registra (o re-vincula) este dispositivo con la cuenta autenticada.
 * El servidor decide la autorización (primer dispositivo: autorizado).
 */
export async function registerDevice(): Promise<DeviceInfo> {
  const meta = await getDeviceMetadata();
  const { data, error } = await supabase.rpc('register_device', {
    p_device_identifier: meta.identifier,
    p_platform: meta.platform,
    p_model: meta.model,
    p_manufacturer: meta.manufacturer,
    p_os_version: meta.os_version,
    p_app_version: meta.app_version,
  });
  if (error) throw error;
  return (data ?? null) as unknown as DeviceInfo;
}

export async function getOperationId(): Promise<string> {
  return Crypto.randomUUID();
}