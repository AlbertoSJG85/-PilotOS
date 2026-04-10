import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/layout/sw-registration';
import { InstallPrompt } from '@/components/layout/install-prompt';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PilotOS by NexOS',
  description: 'Gestión profesional de taxi y VTC',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'PilotOS',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    // Apple touch icon — iOS home screen
    apple: [
      { url: '/branding/pilotos/icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
    // Favicon estándar
    icon: [
      { url: '/branding/pilotos/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/branding/pilotos/icon-192.png',   sizes: '192x192', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#8DC63F',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ServiceWorkerRegistration />
        <InstallPrompt />
        {children}
      </body>
    </html>
  );
}
