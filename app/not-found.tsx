import Link from 'next/link';
import { Home, SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="app-error-page">
      <section className="app-error-card card pad">
        <div className="app-error-flag">
          <SearchX size={18} aria-hidden="true" />
          <span>Halaman tidak ditemukan</span>
        </div>
        <h1>404</h1>
        <p className="app-error-copy">
          Halaman yang kamu buka tidak ada atau sudah dipindahkan.
        </p>
        <div className="app-error-actions">
          <Link className="btn" href="/">
            <Home size={16} aria-hidden="true" />
            Kembali ke beranda
          </Link>
        </div>
      </section>
    </main>
  );
}
