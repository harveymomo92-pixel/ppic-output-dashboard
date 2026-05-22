import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PPIC Output Dashboard',
  description: 'Prototype dashboard output produksi PPIC dari ItemLedgerPPIC',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
