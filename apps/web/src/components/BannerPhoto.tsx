'use client';
import { useState } from 'react';
import { fetchApi } from '../lib/api';

export function BannerPhoto({
  value,
  endpoint,
  onChange,
}: {
  value?: string | null;
  endpoint: string;
  onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function upload(file?: File) {
    if (!file) return;
    setError('');
    if (file.size > 1024 * 1024) {
      setError('Banner must be 1 MB or smaller.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG or WebP image.');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('banner', file);
      const result = await fetchApi<{ bannerPhotoUrl: string }>(endpoint, { method: 'POST', body });
      onChange(result.bannerPhotoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload banner.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {value ? (
        <div className="w-full h-36 rounded-xl overflow-hidden bg-surface-container border border-outline-variant/30 relative">
          <img src={value} alt="Profile banner" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div
          aria-label="No profile banner"
          className="w-full h-28 rounded-xl bg-surface-container-high/40 border border-dashed border-outline-variant/50 text-on-surface-variant flex items-center justify-center text-sm"
        >
          No profile banner
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <label className="font-semibold cursor-pointer text-primary hover:underline">
          {busy ? 'Saving banner…' : value ? 'Change banner' : 'Upload banner'}
          <input
            aria-label="Upload profile banner"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            disabled={busy}
            className="text-error hover:underline text-sm"
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await fetchApi(endpoint, { method: 'DELETE' });
                onChange(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not remove banner.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove banner
          </button>
        )}
      </div>
      <p className="text-xs text-on-surface-variant">JPEG, PNG or WebP. Maximum 1 MB.</p>
      {error && (
        <p role="alert" className="text-error text-sm text-center">
          {error}
        </p>
      )}
    </div>
  );
}
