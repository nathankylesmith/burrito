import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'DishSwipe Admin',
  description: 'Operations dashboard for DishSwipe data refreshes',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="top-nav">
          <div className="nav-brand">DishSwipe Admin</div>
          <nav>
            <Link href="/">Regions</Link>
            <Link href="/restaurants-nearby">Restaurants nearby</Link>
          </nav>
        </header>
        <div className="page-shell">{children}</div>
      </body>
    </html>
  );
}
