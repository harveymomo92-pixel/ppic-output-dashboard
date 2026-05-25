'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body>
        <main className="app-error-page">
          <section className="app-error-card card pad">
            <div className="app-error-flag">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>Halaman error</span>
            </div>
            <h1>Terjadi gangguan saat memuat halaman</h1>
            <p className="app-error-copy">
              Ada bagian aplikasi yang gagal dirender. Coba muat ulang dulu, atau kembali ke beranda kalau masalahnya masih muncul.
            </p>
            <div className="app-error-actions">
              <button className="btn" type="button" onClick={reset}>
                <RotateCcw size={16} aria-hidden="true" />
                Muat ulang
              </button>
              <Link className="btn secondary" href="/">
                <Home size={16} aria-hidden="true" />
                Beranda
              </Link>
            </div>
            <details className="app-error-details">
              <summary>Detail teknis</summary>
              <pre>{error.message}</pre>
              {error.digest ? <code>{error.digest}</code> : null}
            </details>
          </section>
        </main>
      </body>
    </html>
  );
}
