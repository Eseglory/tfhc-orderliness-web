'use client';
export function AuthTransition({ action }: { action: 'in' | 'out' }) {
  return <div role="status" aria-live="polite" aria-label={action === 'in' ? 'Signing in' : 'Signing out'} className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/95 backdrop-blur-xl text-white">
    <div className="text-center space-y-6 p-8"><div className="relative mx-auto h-24 w-24"><div className="absolute inset-0 rounded-full border-4 border-white/10"/><div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-400 border-r-amber-400 animate-spin motion-reduce:animate-none"/><span className="absolute inset-0 grid place-items-center text-3xl font-bold">TF</span></div><h2 className="text-2xl font-semibold">{action === 'in' ? 'Welcome to Orderliness' : 'See you at the next service'}</h2><p className="text-slate-300">{action === 'in' ? 'Signing you in securely…' : 'Signing you out…'}</p></div>
  </div>;
}
