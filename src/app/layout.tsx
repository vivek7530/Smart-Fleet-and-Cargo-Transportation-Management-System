import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { themeScript } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: {
    default: 'CargoEntry — Smart Fleet & Cargo Transportation Management',
    template: '%s · CargoEntry',
  },
  description:
    'Manage trucks, drivers, cargo, trips, fuel, maintenance, expenses and documents from one modern fleet operations platform.',
  applicationName: 'CargoEntry',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1017' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Drivers use this on a phone; pinch-zoom must stay available.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before paint so there is no light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
