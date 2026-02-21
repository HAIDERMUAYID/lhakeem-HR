'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

const routeLabels: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  employees: 'الموظفين',
  departments: 'الأقسام',
  leaves: 'الإجازات',
  'leave-types': 'أنواع الإجازات',
  absences: 'الغيابات',
  holidays: 'العطل',
  schedules: 'جداول الدوام',
  'official-report': 'تقرير رسمي',
  reports: 'التقارير',
  settings: 'الإعدادات',
  users: 'المستخدمون',
  'audit-logs': 'سجل التدقيق',
  calendar: 'التقويم',
  'data-completion': 'إكمال البيانات',
  imports: 'الاستيراد',
  devices: 'أجهزة البصمة',
  'fingerprint-calendar': 'تقويم البصمة',
  'change-password': 'تغيير كلمة المرور',
  day: 'يوم',
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const lastLabel = routeLabels[segments[segments.length - 1]] ?? segments[segments.length - 1];

  return (
    <nav className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 overflow-x-auto overflow-y-hidden scrollbar-hide min-h-[32px]" aria-label="مسار التنقل">
      {/* على الجوال: عرض آخر مستوى فقط مع رابط للوحة التحكم */}
      <span className="flex items-center gap-1 sm:hidden shrink-0">
        {segments.length > 1 && (
          <>
            <Link href="/dashboard" className="hover:text-primary-600 transition-colors truncate">
              لوحة التحكم
            </Link>
            <ChevronLeft className="h-3.5 w-3.5 text-gray-400 rotate-180 shrink-0" />
          </>
        )}
        <span className="font-medium text-gray-900 truncate">{lastLabel}</span>
      </span>
      {/* من sm فما فوق: المسار الكامل */}
      <span className="hidden sm:flex items-center gap-1 flex-wrap">
        {segments.map((segment, i) => {
          const href = '/' + segments.slice(0, i + 1).join('/');
          const label = routeLabels[segment] ?? segment;
          const isLast = i === segments.length - 1;
          return (
            <span key={href} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronLeft className="h-4 w-4 text-gray-400 rotate-180 shrink-0" />
              )}
              {isLast ? (
                <span className="font-medium text-gray-900">{label}</span>
              ) : (
                <Link href={href} className="hover:text-primary-600 transition-colors truncate">
                  {label}
                </Link>
              )}
            </span>
          );
        })}
      </span>
    </nav>
  );
}
