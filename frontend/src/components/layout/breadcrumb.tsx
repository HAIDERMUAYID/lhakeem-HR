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
  reports: 'التقارير',
  settings: 'الإعدادات',
  users: 'المستخدمون',
  'audit-logs': 'سجل التدقيق',
  calendar: 'التقويم',
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 mb-4">
      {segments.map((segment, i) => {
        const href = '/' + segments.slice(0, i + 1).join('/');
        const label = routeLabels[segment] ?? segment;
        const isLast = i === segments.length - 1;

        return (
          <span key={href} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronLeft className="h-4 w-4 text-gray-400 rotate-180" />
            )}
            {isLast ? (
              <span className="font-medium text-gray-900">{label}</span>
            ) : (
              <Link href={href} className="hover:text-primary-600 transition-colors">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
