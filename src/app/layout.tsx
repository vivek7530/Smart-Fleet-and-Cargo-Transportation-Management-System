import type { Metadata, Viewport } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { themeScript } from '@/components/theme-provider';

const roboto = Roboto({
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
  variable: '--font-roboto',
});

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
    { media: '(prefers-color-scheme: light)', color: '#f8f6f2' },
    { media: '(prefers-color-scheme: dark)', color: '#090e18' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Drivers use this on a phone; pinch-zoom must stay available.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={roboto.variable} suppressHydrationWarning>
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
