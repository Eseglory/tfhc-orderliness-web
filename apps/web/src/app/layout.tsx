import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TFHC Orderliness Attendance & Participation Tracker',
  description: 'Event-based attendance, punctuality tracking, geofencing, dynamic QR verification, and participation leaderboard platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
