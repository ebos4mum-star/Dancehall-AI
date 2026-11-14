import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { SECTIONS } from '@/sections';

export const metadata: Metadata = {
  title: 'DanceHall Fit AI Admin',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: '#FFF9F4',
          color: '#1F1633',
        }}
      >
        <div style={{ background: '#FFF1D6', color: '#8A4B00', padding: '8px 16px' }} role="status">
          Foundation only: staff sign-in, MFA and data are not connected. No real accounts or data.
        </div>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <nav
            aria-label="Admin sections"
            style={{ width: 220, padding: 16, borderRight: '1px solid #E6DCEB' }}
          >
            <p style={{ fontWeight: 800 }}>DanceHall Fit AI</p>
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
              <li>
                <Link href="/">Overview</Link>
              </li>
              {SECTIONS.map((s) => (
                <li key={s.slug}>
                  <Link href={`/${s.slug}`}>{s.title}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <main style={{ flex: 1, padding: 24, maxWidth: 800 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
