import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from '../components/BottomNav';
import { OfflineBanner } from '../components/OfflineBanner';

export const metadata: Metadata = {
  title: 'TFHC Orderliness Attendance & Participation Tracker',
  description: 'Event-based attendance, punctuality tracking, geofencing, dynamic QR verification, and participation leaderboard platform.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0F172A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased selection:bg-amber-500 selection:text-slate-950 pb-20 bg-slate-950 text-slate-100">
        <OfflineBanner />
        {children}
        <BottomNav />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) { console.log('PWA ServiceWorker registered with scope: ', registration.scope); },
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
