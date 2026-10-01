import * as Location from 'expo-location';

import { LocationFix } from '@/types';

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function hasLocationServices(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getLocationFix(
  branchLat: number,
  branchLon: number
): Promise<{ fix: LocationFix; mocked: boolean }> {
  let position: Location.LocationObject;
  try {
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  } catch {
    // Retry with a lower power provider if a GPS-only fix times out indoors.
    position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  }

  const fix: LocationFix = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    accuracy: position.coords.accuracy,
    distanceToBranch: getDistanceMeters(
      position.coords.latitude,
      position.coords.longitude,
      branchLat,
      branchLon
    ),
  };

  return { fix, mocked: position.mocked ?? false };
}
