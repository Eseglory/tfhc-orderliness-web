import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { tokenStore } from '../services/auth';
import { registerForPushNotifications } from '../services/notifications';

type User = { id: string; email: string; role: 'MEMBER' | 'LEADER' | 'ADMIN'; member?: { firstName: string; lastName: string } };
type AuthContextValue = { user: User | null; ready: boolean; signInWithGoogle(idToken: string): Promise<void>; signOut(): Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { (async () => {
    try { if (await tokenStore.get()) setUser(await api<User>('/auth/me')); }
    catch { await tokenStore.clear(); }
    finally { setReady(true); }
  })(); }, []);
  const signInWithGoogle = async (idToken: string) => {
    const result = await api<{ accessToken: string; user: User }>('/auth/google/member', { method: 'POST', body: JSON.stringify({ idToken }) });
    await tokenStore.set(result.accessToken); setUser(result.user);
    registerForPushNotifications().catch(() => undefined);
  };
  const signOut = async () => { await tokenStore.clear(); setUser(null); };
  return <AuthContext.Provider value={{ user, ready, signInWithGoogle, signOut }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider is missing'); return value; };
