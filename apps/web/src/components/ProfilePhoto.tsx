'use client';
import { useState } from 'react';
import { fetchApi } from '../lib/api';

export function ProfilePhoto({ value, endpoint, onChange }: { value?: string | null; endpoint: string; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    if (file.size > 2 * 1024 * 1024) { setError('Profile picture must be 2 MB or smaller.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG or WebP image.'); return; }
    setBusy(true);
    try {
      const body = new FormData(); body.append('photo', file);
      const result = await fetchApi<{ profilePhotoUrl: string }>(endpoint, { method: 'POST', body });
      onChange(result.profilePhotoUrl);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not upload photo.'); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-col items-center gap-3">
    {value ? <img src={value} alt="Profile picture" className="w-24 h-24 rounded-full object-cover" /> : <div aria-label="No profile picture" className="w-24 h-24 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center">No photo</div>}
    <label className="text-sm font-semibold">{busy ? 'Saving photo…' : 'Upload profile picture'}
      <input aria-label="Upload profile picture" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="block mt-2 max-w-full text-sm" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
    <p className="text-xs">JPEG, PNG or WebP. Maximum 2 MB.</p>
    {value && <button type="button" disabled={busy} className="text-sm underline" onClick={async () => {
      setBusy(true); setError('');
      try { await fetchApi(endpoint, { method: 'DELETE' }); onChange(null); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not remove photo.'); }
      finally { setBusy(false); }
    }}>Remove photo</button>}
    {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
  </div>;
}
