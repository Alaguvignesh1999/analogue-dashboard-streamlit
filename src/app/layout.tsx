import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/theme/provider';
import { buildThemeStyleSheet, THEMES } from '@/theme/registry';
import { getThemeBootScript } from '@/theme/script';

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Analogue Engine — Cross-Asset Event Dashboard',
  description: 'Multi-event, multi-asset historical analogue framework for geopolitical and macro shock analysis.',
};

export const viewport: Viewport = {
  themeColor: THEMES.dark.themeColor,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: buildThemeStyleSheet() }} />
        <script dangerouslySetInnerHTML={{ __html: getThemeBootScript() }} />
      </head>
      <body className={`${plexMono.variable} ${plexSans.variable} bg-bg-primary text-text-primary min-h-screen transition-colors duration-200`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
