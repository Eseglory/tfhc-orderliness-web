'use client';
import { useState, type ImgHTMLAttributes } from 'react';
import { resolveProfileImage } from '../lib/profile-image';

export function ProfileImage({ src, alt = 'Profile picture', onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const resolved = resolveProfileImage(src);
  const [failed, setFailed] = useState<string>();
  // Keep the image's layout intact if a photo was removed or its provider fails.
  return <img {...props} src={resolved && failed !== resolved ? resolved : '/logo-icon.svg'} alt={alt}
    loading={props.loading ?? 'lazy'} decoding="async"
    onError={event => { setFailed(resolved); onError?.(event); }} />;
}
