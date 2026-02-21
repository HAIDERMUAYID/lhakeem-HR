'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
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

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; permission: string | string[] | null };

/** أقسام للعرض فقط — كل الروابط ظاهرة، مع عنوان خفيف لكل مجموعة */
const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'الرئيسية',
    items: [{ href: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, permission: null }],
  },
  {
    title: 'الموظفين والبيانات',
    items: [
      { href: '/dashboard/employees', label: 'الموظفين', icon: Users, permission: 'EMPLOYEES_VIEW' },
      { href: '/dashboard/data-completion', label: 'إكمال البيانات', icon: ClipboardCheck, permission: 'EMPLOYEES_VIEW' },
      { href: '/dashboard/imports', label: 'الاستيراد', icon: Upload, permission: 'EMPLOYEES_MANAGE' },
      { href: '/dashboard/departments', label: 'الأقسام', icon: Building2, permission: 'DEPARTMENTS_MANAGE' },
    ],
  },
  {
    title: 'البصمة والغيابات',
    items: [
      { href: '/dashboard/devices', label: 'أجهزة البصمة', icon: Fingerprint, permission: ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER', 'DEPARTMENTS_MANAGE'] },
      { href: '/dashboard/fingerprint-calendar', label: 'تقويم وحدة البصمة', icon: CalendarDays, permission: ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER', 'DEPARTMENTS_MANAGE'] },
      { href: '/dashboard/absences', label: 'الغيابات', icon: UserX, permission: ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER'] },
    ],
  },
  {
    title: 'الإجازات والدوام',
    items: [
      { href: '/dashboard/leaves', label: 'الإجازات', icon: Calendar, permission: 'LEAVES_VIEW' },
      { href: '/dashboard/leaves/calendar', label: 'تقويم الإجازات', icon: CalendarRange, permission: 'LEAVES_VIEW' },
      { href: '/dashboard/leave-types', label: 'أنواع الإجازات', icon: Calendar, permission: 'LEAVE_TYPES_MANAGE' },
      { href: '/dashboard/holidays', label: 'العطل', icon: CalendarDays, permission: ['LEAVES_VIEW', 'HOLIDAYS_VIEW'] },
      { href: '/dashboard/schedules', label: 'جداول الدوام', icon: ClipboardList, permission: 'SCHEDULES_VIEW' },
    ],
  },
  {
    title: 'النظام والصلاحيات',
    items: [
      { href: '/dashboard/reports', label: 'التقارير', icon: BarChart3, permission: 'REPORTS_VIEW' },
      { href: '/dashboard/settings', label: 'الإعدادات', icon: Settings, permission: 'SETTINGS_VIEW' },
      { href: '/dashboard/change-password', label: 'تغيير كلمة المرور', icon: KeyRound, permission: null },
      { href: '/dashboard/users', label: 'المستخدمون', icon: UserCog, permission: 'USERS_MANAGE' },
      { href: '/dashboard/audit-logs', label: 'سجل التدقيق', icon: FileText, permission: 'AUDIT_VIEW' },
    ],
  },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  mobile?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

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

  const visibleSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => hasAccess(item.permission)),
        }))
        .filter((section) => section.items.length > 0),
    [userPermissions]
  );

  const navContent = (
    <>
      {/* الهيدر */}
      <div
        className={cn(
          'flex shrink-0 items-center border-b border-gray-100/80 bg-white/80 backdrop-blur-sm',
          collapsed ? 'h-16 justify-center px-2' : 'h-[4.5rem] justify-between px-4 gap-2'
        )}
      >
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
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-600"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {!mobile && onCollapsedChange && (
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-3 gap-0" aria-label="القائمة الرئيسية">
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.title} className={cn('flex flex-col gap-0.5', sectionIndex > 0 && 'mt-4')}>
            {!collapsed && (
              <div className="px-3 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{section.title}</span>
              </div>
            )}
            {collapsed && sectionIndex > 0 && <div className="my-1 h-px bg-gray-200/80" />}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const linkClass = cn(
                  'flex min-h-[44px] items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-2',
                  isActive ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                );
                if (collapsed) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={mobile ? onClose : undefined}
                      title={item.label}
                      className={cn(linkClass, 'justify-center px-0 min-w-[44px]')}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                    </Link>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={mobile ? onClose : undefined}
                    className={cn(linkClass, 'px-3 py-2.5')}
                  >
                    <Icon className="h-5 w-5 shrink-0 opacity-90" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  if (mobile) {
    return (
      <>
        <div
          role="presentation"
          className={cn(
            'fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden transition-opacity duration-200',
            open ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          onClick={onClose}
        />
        <aside
          data-print-hide
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full flex-col w-72 max-w-[min(85vw,320px)] rounded-l-2xl border-l border-gray-200 bg-white shadow-2xl lg:hidden transition-[transform] duration-200 ease-out overflow-hidden',
            'overscroll-contain',
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
        'hidden lg:flex lg:flex-col lg:h-full fixed inset-y-0 right-0 z-40 rounded-l-2xl border-l border-gray-200 bg-white/98 backdrop-blur-md shadow-lg transition-[width] duration-200 ease-out overflow-hidden',
        collapsed ? 'w-[4.5rem]' : 'w-72'
      )}
    >
      {navContent}
    </aside>
  );
}

export function SidebarTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors lg:hidden"
      style={{ minHeight: 44, minWidth: 44 }}
      aria-label="فتح القائمة"
    >
      <Menu className="h-5 w-5 text-gray-600" />
    </button>
  );
}
