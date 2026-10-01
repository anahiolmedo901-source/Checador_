import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';
const isSsr = typeof window === 'undefined';

type ScopedStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

function webStorage(): ScopedStorage {
  return {
    getItemAsync: (key: string) => AsyncStorage.getItem(key),
    setItemAsync: (key: string, value: string) => AsyncStorage.setItem(key, value),
    deleteItemAsync: (key: string) => AsyncStorage.removeItem(key),
  };
}

const storage: ScopedStorage = isWeb || isSsr ? webStorage() : SecureStore;

function unwrap(value: string | null): string | null {
  if (value == null || value === '') return null;
  return value;
}

export async function getSecureValue(key: string): Promise<string | null> {
  if (isSsr) return null;
  return unwrap(await storage.getItemAsync(key));
}

export async function setSecureValue(key: string, value: string): Promise<void> {
  if (isSsr) return;
  await storage.setItemAsync(key, value);
}

