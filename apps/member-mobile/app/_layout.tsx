import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/state/auth-context';

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><Stack screenOptions={{ headerShown: false, animation: 'fade' }} /></AuthProvider></SafeAreaProvider>;
}
