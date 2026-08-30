import * as Location from 'expo-location';

export async function getCheckInLocation() {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) throw new Error('Location services are turned off. Enable them to check in.');
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Location permission is required to verify your check-in.');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    gpsAccuracy: position.coords.accuracy ?? undefined,
  };
}
