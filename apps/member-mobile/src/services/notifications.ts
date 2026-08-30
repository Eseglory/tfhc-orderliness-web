import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from './api';

export async function registerForPushNotifications() {
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await api('/devices/push-token', { method: 'POST', body: JSON.stringify({ token, platform: Platform.OS }) });
  return token;
}
