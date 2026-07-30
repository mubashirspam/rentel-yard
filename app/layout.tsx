import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Yard Ledger',
  description: 'Rental management for a construction equipment yard.',
};

export const viewport: Viewport = {
  // The admin surface is a phone screen held one-handed in a yard (§01).
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2f5169',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
