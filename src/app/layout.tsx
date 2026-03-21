import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Analogue Engine — Cross-Asset Event Dashboard',
  description: 'Multi-event, multi-asset historical analogue framework for geopolitical and macro shock analysis.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg-primary text-text-primary min-h-screen">
        {children}
      </body>
    </html>
  );
}
