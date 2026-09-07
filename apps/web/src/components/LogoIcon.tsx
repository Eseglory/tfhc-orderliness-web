import Image from 'next/image';

// The brand mark is reused across the app as a placeholder avatar/logo icon
// (member photo upload doesn't exist yet). It's a small local SVG, so
// next/image's raster resizing pipeline has nothing to optimize — `unoptimized`
// skips that work rather than paying for it with no benefit. Using the
// component (over a raw <img>) still gets required-dimension layout-shift
// safety and keeps every call site consistent.
export function LogoIcon({ alt, className }: { alt: string; className?: string }) {
  return <Image src="/logo-icon.svg" alt={alt} width={48} height={48} unoptimized className={className} />;
}
