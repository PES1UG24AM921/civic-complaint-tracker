import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Civic Complaint Portal',
  description: 'SLA-based civic complaint tracking system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
