'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notifications } from './notifications';
import { AppLogo } from './app-logo';

export function Header({ userName, sidebarTrigger }: { userName?: string; sidebarTrigger?: React.ReactNode }) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    document.cookie = 'token=; path=/; max-age=0';
    router.push('/login');
  };

  return (
    <header data-print-hide className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200/80 bg-white/90 backdrop-blur-xl px-4 sm:px-6">
      <div className="flex items-center gap-3">
        {sidebarTrigger}
        <AppLogo size={36} compact animated className="hidden sm:flex shrink-0" />
        <span className="text-sm text-gray-500 hidden sm:inline">نظام الموارد البشرية – مستشفى الحكيم العام</span>
      </div>
      <div className="flex items-center gap-3">
        <Notifications />
        {userName && (
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <User className="h-4 w-4" />
            {userName}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="gap-2 min-h-[44px]"
        >
          <LogOut className="h-4 w-4" />
          خروج
        </Button>
      </div>
    </header>
  );
}
