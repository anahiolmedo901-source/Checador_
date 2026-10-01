import * as Network from 'expo-network';

async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) return false;
    // En iOS esConnected == internet alcanzable; en Android se reporta por separado.
    return state.isInternetReachable !== false;
  } catch {
    // Si no se puede medir, no bloqueamos la operación (el RPC fallará
    // con su propio mensaje de red si realmente no hay conexión).
    return true;
  }
}

export async function assertOnline(): Promise<void> {
  const online = await isOnline();
  if (!online) {
    throw new Error(
      'No hay conexión a internet. Las checadas solo se registran en línea para validar tu ubicación y evidencia.'
    );
  }
}