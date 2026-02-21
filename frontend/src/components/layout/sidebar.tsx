'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  UserCog,
  Building2,
  Calendar,
  CalendarRange,
  UserX,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  BarChart3,
  Settings,
  FileText,
  Upload,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Fingerprint,
  KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLogo } from './app-logo';

/** ربط عناصر القائمة بصلاحيات الـ backend (أي صلاحية من القائمة تكفي للظهور) */
const baseNavItems: { href: string; label: string; icon: typeof LayoutDashboard; permission: string | string[] | null }[] = [
  { href: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, permission: null },
  { href: '/dashboard/employees', label: 'الموظفين', icon: Users, permission: 'EMPLOYEES_VIEW' },
  { href: '/dashboard/data-completion', label: 'إكمال البيانات', icon: ClipboardCheck, permission: 'EMPLOYEES_VIEW' },
  { href: '/dashboard/imports', label: 'الاستيراد', icon: Upload, permission: 'EMPLOYEES_MANAGE' },
  { href: '/dashboard/departments', label: 'الأقسام', icon: Building2, permission: 'DEPARTMENTS_MANAGE' },
  { href: '/dashboard/devices', label: 'أجهزة البصمة', icon: Fingerprint, permission: ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER', 'DEPARTMENTS_MANAGE'] },
  { href: '/dashboard/fingerprint-calendar', label: 'تقويم وحدة البصمة', icon: CalendarDays, permission: ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER', 'DEPARTMENTS_MANAGE'] },
  { href: '/dashboard/leaves', label: 'الإجازات', icon: Calendar, permission: 'LEAVES_VIEW' },
  { href: '/dashboard/leaves/calendar', label: 'تقويم الإجازات', icon: CalendarRange, permission: 'LEAVES_VIEW' },
  { href: '/dashboard/leave-types', label: 'أنواع الإجازات', icon: Calendar, permission: 'LEAVE_TYPES_MANAGE' },
  { href: '/dashboard/absences', label: 'الغيابات', icon: UserX, permission: ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER'] },
  { href: '/dashboard/holidays', label: 'العطل', icon: CalendarDays, permission: ['LEAVES_VIEW', 'HOLIDAYS_VIEW'] },
  { href: '/dashboard/schedules', label: 'جداول الدوام', icon: ClipboardList, permission: 'SCHEDULES_VIEW' },
  { href: '/dashboard/reports', label: 'التقارير', icon: BarChart3, permission: 'REPORTS_VIEW' },
  { href: '/dashboard/settings', label: 'الإعدادات', icon: Settings, permission: 'SETTINGS_VIEW' },
  { href: '/dashboard/change-password', label: 'تغيير كلمة المرور', icon: KeyRound, permission: null },
  { href: '/dashboard/users', label: 'المستخدمون', icon: UserCog, permission: 'USERS_MANAGE' },
  { href: '/dashboard/audit-logs', label: 'سجل التدقيق', icon: FileText, permission: 'AUDIT_VIEW' },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  mobile?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const SIDEBAR_WIDTH = 288; // w-72
const SIDEBAR_COLLAPSED_WIDTH = 80; // icons only

export function Sidebar({ open = true, onClose, mobile = false, collapsed = false, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  const [userPermissions, setUserPermissions] = useState<string[]>([]);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        const parsed = JSON.parse(u);
        setUserPermissions(parsed?.permissions ?? []);
      } catch {
        setUserPermissions([]);
      }
    }
  }, []);

  const hasAccess = (perm: string | string[] | null) => {
    if (!perm) return true;
    if (userPermissions.includes('ADMIN')) return true;
    const list = Array.isArray(perm) ? perm : [perm];
    return list.some((p) => userPermissions.includes(p));
  };

  const navItems = baseNavItems.filter((item) => hasAccess(item.permission));

  const navContent = (
    <>
      <div className={cn('flex h-20 items-center border-b border-gray-100 transition-all', collapsed ? 'justify-center px-2' : 'justify-between px-4 gap-2')}>
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <AppLogo size={collapsed ? 40 : 48} compact={collapsed} animated />
          {!collapsed && (
            <div className="min-w-0">
              <span className="text-base font-bold text-primary-800 block truncate">مستشفى الحكيم العام</span>
              <span className="text-xs text-gray-500 block truncate">نظام الموارد البشرية</span>
            </div>
          )}
        </div>
        {mobile && onClose && !collapsed && (
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        )}
        {!mobile && onCollapsedChange && (
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        )}
      </div>
      <nav className="flex flex-col gap-1 p-3 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={mobile ? onClose : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-xl text-sm font-medium transition-all duration-200 min-h-[44px]',
                collapsed ? 'justify-center px-3' : 'gap-3 px-4',
                isActive
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );

  if (mobile) {
    return (
      <>
        <div
          className={cn(
            'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-opacity duration-300',
            open ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          onClick={onClose}
        />
        <aside
          data-print-hide
          className={cn(
            'fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] border-l border-gray-200/80 bg-white shadow-2xl lg:hidden transition-transform duration-300 ease-out',
            open ? 'translate-x-0' : 'translate-x-full'
          )}
        >
          {navContent}
        </aside>
      </>
    );
  }

  return (
    <aside
      data-print-hide
      data-sidebar-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        'hidden lg:block fixed inset-y-0 right-0 z-40 border-l border-gray-200/80 bg-white/95 backdrop-blur-xl shadow-md transition-[width] duration-200 ease-out',
        collapsed ? 'w-20' : 'w-72'
      )}
    >
      {navContent}
    </aside>
  );
}

export function SidebarTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-gray-100 transition-colors lg:hidden"
      aria-label="فتح القائمة"
    >
      <Menu className="h-5 w-5 text-gray-600" />
    </button>
  );
}
