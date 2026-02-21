'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar, SidebarTrigger } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { CopyrightFooter } from '@/components/layout/copyright-footer';
import { cn } from '@/lib/utils';
import { canAccessPath } from '@/lib/route-permissions';

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

type UserState = { name?: string; permissions?: string[] } | null;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserState>(null);
  const [loading, setLoading] = useState(true);
  const [redirectingToLogin, setRedirectingToLogin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (!token) {
      setLoading(false);
      setRedirectingToLogin(true);
      try {
        document.cookie = 'token=; path=/; max-age=0';
      } catch {
        // ignore
      }
      router.replace('/login');
      return;
    }
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch {
        setUser(null);
      }
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (loading || !pathname) return;
    const allowed = canAccessPath(pathname, user?.permissions ?? []);
    if (!allowed) {
      router.replace('/dashboard');
    }
  }, [loading, pathname, user?.permissions, router]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (redirectingToLogin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
        <p className="text-sm text-gray-600">جاري التحويل إلى تسجيل الدخول...</p>
        <a href="/login" className="text-primary-600 underline">
          إذا لم يتم التحويل، اضغط هنا
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Sidebar
        mobile={false}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      <Sidebar mobile open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <div
        className={cn(
          'min-h-screen flex flex-col transition-[margin-right] duration-200 ease-out',
          sidebarCollapsed ? 'lg:mr-20' : 'lg:mr-72'
        )}
      >
        <Header userName={user?.name} sidebarTrigger={<SidebarTrigger onClick={() => setMobileMenuOpen(true)} />} />
        <main className="flex-1 p-4 sm:p-6 md:p-8">
          <Breadcrumb />
          {children}
        </main>
        <CopyrightFooter className="border-t border-gray-200/80 bg-white/50" />
      </div>
    </div>
  );
}
