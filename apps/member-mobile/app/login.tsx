import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../src/state/auth-context';
WebBrowser.maybeCompleteAuthSession();
export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({ iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
  useEffect(() => { if (response?.type === 'success') { const token = response.params.id_token; if (!token) return Alert.alert('Sign in failed', 'Google did not return an identity token.'); signInWithGoogle(token).then(() => router.replace('/(member)')).catch((e) => Alert.alert('Sign in failed', e instanceof Error ? e.message : 'Please try again.')); } }, [response, signInWithGoogle]);
  return <View style={styles.page}><View style={styles.card}><Text style={styles.eyebrow}>TFHC ORDERLINESS</Text><Text style={styles.title}>Member access</Text><Text style={styles.copy}>Use your approved Google account to access attendance, services, and performance.</Text><Pressable style={styles.button} disabled={!request} onPress={() => promptAsync()}><Text style={styles.buttonText}>Continue with Google</Text></Pressable><Text style={styles.notice}>Only approved active members can access this application.</Text></View></View>;
}
const styles = StyleSheet.create({ page:{flex:1,justifyContent:'center',padding:24,backgroundColor:'#f8f9ff'},card:{backgroundColor:'#fff',padding:24,borderRadius:16,gap:14},eyebrow:{fontSize:12,fontWeight:'700',letterSpacing:1.2,color:'#904d00'},title:{fontSize:30,fontWeight:'700',color:'#0b1c30'},copy:{color:'#45464d',lineHeight:21},button:{height:52,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:'#131b2e',marginTop:8},buttonText:{color:'#fff',fontWeight:'700',fontSize:16},notice:{fontSize:12,color:'#45464d',textAlign:'center'} });
