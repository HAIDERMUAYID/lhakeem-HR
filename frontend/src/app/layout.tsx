import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/components/providers/query-provider';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'نظام إدارة الإجازات | مستشفى الحكيم',
  description: 'نظام إدارة الإجازات والدوام والغيابات',
  manifest: '/manifest.json',
  themeColor: '#0F4C81',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  appleWebApp: { capable: true, title: 'الحكيم HR' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="font-sans antialiased bg-[#f5f7fa] text-gray-900 min-h-screen selection:bg-primary-100">
        <QueryProvider>{children}</QueryProvider>
        <Toaster
          position="top-center"
          dir="rtl"
          richColors
          closeButton
          toastOptions={{
            className: 'rounded-xl shadow-lg border border-gray-100',
          }}
        />
      </body>
    </html>
  );
}
