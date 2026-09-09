import { VenueSessionGuard } from '../components/VenueSessionGuard';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthGate } from '../components/AuthGate';
import { BottomNav } from '../components/BottomNav';
import { OfflineBanner } from '../components/OfflineBanner';

const inter = localFont({
  src: '../../public/fonts/inter-latin.woff2',
  weight: '400 700',
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TFHC Orderliness Attendance & Participation Tracker',
  description: 'Event-based attendance, punctuality tracking, geofencing, and participation leaderboard platform.',
  manifest: '/manifest.json',
  other: { 'apple-mobile-web-app-capable': 'yes' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TFHC Tracker',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#f8f9ff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`light ${inter.variable}`}>
      <body className="antialiased selection:bg-secondary-container selection:text-on-secondary-container bg-background text-on-background font-body-md min-h-screen">
        <OfflineBanner />
        <VenueSessionGuard />
        <AuthGate>{children}</AuthGate>
        <BottomNav />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function() { /* Registration completed. */ },
                    function(err) { console.log('PWA ServiceWorker registration failed: ', err); }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
