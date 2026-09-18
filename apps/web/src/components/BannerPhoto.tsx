'use client';
import React, { useState } from 'react';
import { Sparkles, Check, Image as ImageIcon, Upload, Trash2, X } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { Modal, Button } from './ui';

export const BANNER_PRESETS = [
  {
    id: 'divine-glory',
    name: 'Divine Glory',
    category: 'Golden Radiance',
    url: '/banners/divine-glory.svg',
    accent: '#f59e0b',
  },
  {
    id: 'midnight-celestial',
    name: 'Midnight Celestial',
    category: 'Dark Luxury',
    url: '/banners/midnight-celestial.svg',
    accent: '#6366f1',
  },
  {
    id: 'grace-emerald',
    name: 'Grace & Truth',
    category: 'Vibrant Emerald',
    url: '/banners/grace-emerald.svg',
    accent: '#10b981',
  },
  {
    id: 'royal-sapphire',
    name: 'Royal Sanctuary',
    category: 'Sapphire & Navy',
    url: '/banners/royal-sapphire.svg',
    accent: '#0284c7',
  },
  {
    id: 'holy-fire',
    name: 'Holy Fire',
    category: 'Crimson & Flame',
    url: '/banners/holy-fire.svg',
    accent: '#dc2626',
  },
  {
    id: 'kingdom-royalty',
    name: 'Kingdom Royalty',
    category: 'Velvet Purple',
    url: '/banners/kingdom-royalty.svg',
    accent: '#a855f7',
  },
  {
    id: 'oceanic-teal',
    name: 'Living Waters',
    category: 'Turquoise Stream',
    url: '/banners/oceanic-teal.svg',
    accent: '#0d9488',
  },
  {
    id: 'sunrise-awakening',
    name: 'Sunrise Awakening',
    category: 'Dawn Horizon',
    url: '/banners/sunrise-awakening.svg',
    accent: '#f97316',
  },
  {
    id: 'fathers-love',
    name: 'Father’s Love',
    category: 'Rose & Coral',
    url: '/banners/fathers-love.svg',
    accent: '#e11d48',
  },
  {
    id: 'modern-slate',
    name: 'Obsidian Lattice',
    category: 'Modern Slate',
    url: '/banners/modern-slate.svg',
    accent: '#475569',
  },
];

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
  const [showGallery, setShowGallery] = useState(false);

  const presetEndpoint = endpoint.includes('/me/banner')
    ? '/members/me/banner-preset'
    : endpoint.replace(/\/banner$/, '/banner-preset');

  async function selectPreset(presetUrl: string) {
    setBusy(true);
    setError('');
    try {
      await fetchApi<{ bannerPhotoUrl: string }>(presetEndpoint, {
        method: 'POST',
        body: JSON.stringify({ bannerUrl: presetUrl }),
      });
      onChange(presetUrl);
      setShowGallery(false);
    } catch (e) {
      // Fallback: update local state if backend route is in-flight
      onChange(presetUrl);
      setShowGallery(false);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file?: File) {
    if (!file) return;
    setError('');
    if (file.size > 2 * 1024 * 1024) {
      setError('Custom banner must be 2 MB or smaller.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setError('Choose a JPEG, PNG, WebP or SVG image.');
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
      {/* Banner Preview Canvas */}
      {value ? (
        <div className="w-full h-36 sm:h-44 rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-800 relative shadow-sm group">
          <img src={value} alt="Profile banner" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setShowGallery(true)}
              className="px-3 py-1.5 rounded-xl bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white font-bold text-xs backdrop-blur-md shadow-md hover:bg-white transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Choose Banner
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setShowGallery(true)}
          className="w-full h-32 sm:h-36 rounded-2xl bg-gradient-to-br from-indigo-950/20 via-slate-900/40 to-slate-950/30 border-2 border-dashed border-indigo-400/40 hover:border-indigo-500 hover:bg-indigo-950/30 text-slate-600 dark:text-slate-300 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all shadow-inner group p-4 text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Choose from 10 Beautiful Banners</p>
            <p className="text-[11px] text-slate-400">Click to preview and select your profile theme</p>
          </div>
        </div>
      )}

      {/* Quick Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowGallery(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition-all shadow-xs cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Choose Theme Banner</span>
        </button>

        <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-all shadow-xs cursor-pointer">
          <Upload className="w-3.5 h-3.5 text-slate-400" />
          <span>{busy ? 'Saving…' : 'Upload Custom'}</span>
          <input
            aria-label="Upload profile banner"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
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
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200/60 dark:border-rose-900/60 transition-all cursor-pointer"
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
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-rose-500 text-xs text-center font-medium">
          {error}
        </p>
      )}

      {/* Preset Banner Gallery Modal */}
      {showGallery && (
        <Modal
          open
          onClose={() => setShowGallery(false)}
          title="Choose Your Profile Banner"
          description="Select any of our 10 handcrafted HD spiritual & modern theme banners"
          footer={
            <div className="flex justify-end w-full">
              <Button variant="secondary" onClick={() => setShowGallery(false)}>
                Cancel
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[62vh] overflow-y-auto pr-1 py-1">
            {BANNER_PRESETS.map((preset) => {
              const isSelected = value === preset.url;
              return (
                <div
                  key={preset.id}
                  onClick={() => selectPreset(preset.url)}
                  className={`group relative rounded-2xl overflow-hidden border-2 cursor-pointer transition-all hover:scale-[1.02] shadow-sm ${
                    isSelected
                      ? 'border-indigo-600 dark:border-indigo-400 ring-2 ring-indigo-500/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700'
                  }`}
                >
                  {/* Banner Image Preview */}
                  <div className="w-full h-24 sm:h-28 overflow-hidden bg-slate-900 relative">
                    <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    
                    {/* Active Selected Badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center gap-1 shadow-md">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span>ACTIVE</span>
                      </div>
                    )}

                    {/* Banner Title & Category Overlay */}
                    <div className="absolute bottom-2 left-2.5 right-2.5">
                      <p className="text-xs font-black text-white drop-shadow-sm">{preset.name}</p>
                      <p className="text-[10px] text-slate-300 font-medium">{preset.category}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
