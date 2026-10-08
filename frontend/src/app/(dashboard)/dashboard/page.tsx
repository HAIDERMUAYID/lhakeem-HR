'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarPlus,
  Clock,
  Fingerprint,
  FileBarChart,
  RefreshCw,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { KpiStrip, type KpiCard } from './_components/kpi-strip';
import { WorkBoard } from './_components/work-board';
import { formatArLongDate } from './_lib';

type Session = { name: string; permissions: string[] };

type EmpStats = { total: number; active: number; inactive: number };
type DeptStats = { total: number; active: number };
type LeaveStats = { total: number; pending: number; approved: number; rejected: number };

const QUICK_ACTIONS = [
  {
    href: '/dashboard/leaves',
    label: 'طلب إجازة',
    icon: CalendarPlus,
    permission: 'LEAVES_CREATE' as const,
  },
  {
    href: '/dashboard/employees',
    label: 'موظف جديد',
    icon: UserPlus,
    permission: 'EMPLOYEES_MANAGE' as const,
  },
  {
    href: '/dashboard/attendance',
    label: 'حضور اليوم',
    icon: Fingerprint,
    permission: 'ATTENDANCE_VIEW' as const,
  },
  {
    href: '/dashboard/reports',
    label: 'التقارير',
    icon: FileBarChart,
    permission: 'REPORTS_VIEW' as const,
  },
];

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('user') || 'null');
      setSession({
        name: parsed?.name ?? '',
        permissions: parsed?.permissions ?? [],
      });
    } catch {
      setSession({ name: '', permissions: [] });
    }
  }, []);

  const permissions = session?.permissions ?? [];
  const canEmployees = hasAnyPermission(permissions, 'EMPLOYEES_VIEW');
  const canDepartments = hasAnyPermission(permissions, 'DEPARTMENTS_VIEW');
  const canLeaves = hasAnyPermission(permissions, 'LEAVES_VIEW');
  const canAbsences = hasAnyPermission(permissions, 'ABSENCES_VIEW');

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const monthLabel = now.toLocaleDateString('ar-IQ', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Baghdad',
  });

  const empStats = useQuery({
    queryKey: ['employees-stats'],
    enabled: !!session && canEmployees,
    queryFn: () => apiGet<EmpStats>('/api/employees/stats'),
  });
  const deptStats = useQuery({
    queryKey: ['departments-stats'],
    enabled: !!session && canDepartments,
    queryFn: () => apiGet<DeptStats>('/api/departments/stats'),
  });
  const leaveStats = useQuery({
    queryKey: ['leave-requests-stats'],
    enabled: !!session && canLeaves,
    queryFn: () => apiGet<LeaveStats>('/api/leave-requests/stats'),
  });
  const absences = useQuery({
    queryKey: ['absences-month'],
    enabled: !!session && canAbsences,
    queryFn: () =>
      apiGet<{ total: number }>(
        `/api/absences?page=1&limit=1&fromDate=${monthStart.toISOString()}&toDate=${monthEnd.toISOString()}`,
      ),
  });

  const kpis = useMemo<KpiCard[]>(() => {
    if (!session) return [];
    const cards: KpiCard[] = [];
    if (canEmployees) {
      cards.push({
        key: 'employees',
        label: 'الموظفون النشطون',
        value: empStats.data?.active ?? 0,
        hint: `${empStats.data?.inactive ?? 0} متوقف · ${empStats.data?.total ?? 0} الإجمالي`,
        href: '/dashboard/employees',
        icon: Users,
      });
    }
    if (canDepartments) {
      cards.push({
        key: 'departments',
        label: 'الأقسام',
        value: deptStats.data?.active ?? deptStats.data?.total ?? 0,
        hint: `${deptStats.data?.total ?? 0} مسجّل`,
        href: '/dashboard/departments',
        icon: Building2,
      });
    }
    if (canLeaves) {
      const pending = leaveStats.data?.pending ?? 0;
      cards.push({
        key: 'leaves',
        label: 'إجازات تنتظر قرارك',
        value: pending,
        hint: pending > 0 ? 'اضغط لفتح الطلبات ثم عدّل أو احذف' : 'لا يوجد طلب معلّق',
        href: '/dashboard/leaves?status=PENDING',
        icon: Clock,
        tone: pending > 0 ? 'warn' : 'default',
      });
    }
    if (canAbsences) {
      cards.push({
        key: 'absences',
        label: 'غيابات هذا الشهر',
        value: absences.data?.total ?? 0,
        hint: monthLabel,
        href: '/dashboard/absences',
        icon: UserX,
      });
    }
    return cards;
  }, [
    session,
    canEmployees,
    canDepartments,
    canLeaves,
    canAbsences,
    empStats.data,
    deptStats.data,
    leaveStats.data,
    absences.data,
    monthLabel,
  ]);

  const quickActions = QUICK_ACTIONS.filter((a) => hasAnyPermission(permissions, a.permission));
  const pendingCount = leaveStats.data?.pending ?? 0;

  const refresh = () => {
    queryClient.invalidateQueries();
  };

  if (!session) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{formatArLongDate()}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
            {session.name ? `مرحباً، ${session.name}` : 'لوحة الإحصاء'}
          </h1>
          <p className="text-gray-500 mt-1">
            مركز الحكيم لأمراض الكلى — ملخص اليوم وما يحتاج إجراءً
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Icon className="h-4 w-4" />
                  {action.label}
                </Button>
              </Link>
            );
          })}
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        </div>
      </header>

      {canLeaves && pendingCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          لديك <span className="font-semibold tabular-nums">{pendingCount}</span> طلب إجازة بانتظار القرار.
          استخدم زر التعديل أو الحذف في لوحة العمل أدناه.
        </div>
      )}

      <KpiStrip cards={kpis} />

      <WorkBoard permissions={permissions} />
    </div>
  );
}
