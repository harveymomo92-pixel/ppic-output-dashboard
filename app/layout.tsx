import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Operasi Produksi',
  description: 'Prototype dashboard operasional produksi dari data Business Central',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
