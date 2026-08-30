import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../src/state/auth-context';
export default function Index() { const { user, ready } = useAuth(); if (!ready) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>; return <Redirect href={user ? '/(member)' : '/login'} />; }
