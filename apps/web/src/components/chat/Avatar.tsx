'use client';
import React from 'react';

const TONES = [
  'bg-primary-container text-on-primary-container',
  'bg-secondary-container text-on-secondary-container',
  'bg-tertiary-container text-on-tertiary-container',
  'bg-surface-container-highest text-on-surface',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({
  name,
  photoUrl,
  size = 40,
  online,
  icon,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  online?: boolean;
  icon?: string;
}) {
  const tone = TONES[name.length % TONES.length];
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center rounded-full font-semibold ${tone}`}
          style={{ fontSize: size * 0.4 }}
        >
          {icon ? (
            <span className="material-symbols-outlined" style={{ fontSize: size * 0.55 }}>
              {icon}
            </span>
          ) : (
            initials(name)
          )}
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-surface-container-lowest ${
            online ? 'bg-on-tertiary-container' : 'bg-outline-variant'
          }`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </span>
  );
}
