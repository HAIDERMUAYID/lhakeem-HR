'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  UserCircle,
  Briefcase,
  Building2,
  Calendar,
  UserX,
  ClipboardList,
  Wallet,
  ArrowRight,
  Sun,
  Moon,
  CalendarCheck,
  Fingerprint,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/shared/page-skeleton';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';

type EmployeeFingerprint = {
  id: string;
  fingerprintId: string;
  device: { id: string; name: string; code?: string | null };
};
type Employee = {
  id: string;
  fullName: string;
  jobTitle: string;
  department: { id: string; name: string };
  manager?: { fullName: string } | null;
  workType: string;
  leaveBalance: number | string;
  balanceStartDate?: string | null;
  isActive: boolean;
  fingerprints?: EmployeeFingerprint[];
  workSchedule?: {
    id: string;
    workType: string;
    shiftPattern?: string | null;
    daysOfWeek: string;
    startTime: string;
    endTime: string;
    status: string;
  } | null;
};

type LeaveRequest = {
  id: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: string;
  leaveType: { nameAr: string };
};

type Absence = {
  id: string;
  date: string;
  reason?: string | null;
  status: string;
};

type BalanceInfo = {
  totalBalanceCumulative: number;
  baseBalance: number;
  balanceStartDate: string;
  leaveDaysInCurrentMonth: number;
  accrualPerMonth: number;
};

const WORK_TYPE_LABEL: Record<string, string> = {
  MORNING: 'صباحي',
  SHIFTS: 'خفارات',
};

const TABS = [
  { id: 'basic', label: 'البيانات الأساسية', icon: UserCircle },
  { id: 'leaves', label: 'الإجازات', icon: Calendar },
  { id: 'absences', label: 'الغيابات', icon: UserX },
  { id: 'schedule', label: 'جدول الدوام', icon: ClipboardList },
  { id: 'balance', label: 'الرصيد', icon: Wallet },
] as const;

export default function EmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('basic');

  const { data: employee, isLoading, error, refetch } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => apiGet<Employee>(`/api/employees/${id}`),
    enabled: !!id,
  });

  const { data: leavesData } = useQuery({
    queryKey: ['leave-requests', 'employee', id],
    queryFn: () =>
      apiGet<{ data: LeaveRequest[]; total: number }>(`/api/leave-requests?employeeId=${id}&limit=50`),
    enabled: !!id && tab === 'leaves',
  });

  const { data: absencesData } = useQuery({
    queryKey: ['absences', 'employee', id],
    queryFn: () =>
      apiGet<{ data: Absence[]; total: number }>(`/api/absences?employeeId=${id}&limit=50`),
    enabled: !!id && tab === 'absences',
  });

  const { data: balanceInfo } = useQuery({
    queryKey: ['leave-balance-info', id],
    queryFn: () => apiGet<BalanceInfo>(`/api/leave-requests/balance-info?employeeId=${id}`),
    enabled: !!id && tab === 'balance',
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  if (!id) {
    return (
      <div className="py-12 text-center text-gray-500">
        <p>معرف الموظف غير متوفر.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/dashboard/employees">العودة للموظفين</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <TableSkeleton rows={6} />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="تعذر تحميل الملف"
          message={error ? (error as Error).message : 'الموظف غير موجود'}
          onRetry={() => refetch()}
        />
        <Button variant="outline" asChild>
          <Link href="/dashboard/employees">العودة للموظفين</Link>
        </Button>
      </div>
    );
  }

  const leaves = leavesData?.data ?? [];
  const absences = absencesData?.data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white">
            <UserCircle className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{employee.fullName}</h1>
            <p className="text-gray-500">{employee.jobTitle} • {employee.department?.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={employee.isActive ? 'success' : 'default'}>
                {employee.isActive ? 'نشط' : 'متوقف'}
              </Badge>
              <Badge variant="secondary">
                {WORK_TYPE_LABEL[employee.workType] ?? employee.workType}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/employees" className="gap-2">
              <ArrowRight className="h-4 w-4" />
              الموظفين
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href={`/dashboard/leaves?employeeId=${id}`} className="gap-2">
              <CalendarCheck className="h-4 w-4" />
              طلب إجازة
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'basic' && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">البيانات الأساسية</h2>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <InfoRow icon={UserCircle} label="الاسم الكامل" value={employee.fullName} />
            <InfoRow icon={Briefcase} label="العنوان الوظيفي" value={employee.jobTitle} />
            <InfoRow icon={Building2} label="القسم" value={employee.department?.name} />
            <InfoRow icon={UserCircle} label="المدير المباشر" value={employee.manager?.fullName ?? '—'} />
            <InfoRow
              icon={Fingerprint}
              label="أجهزة البصمة ومعرف الموظف"
              value={
                employee.fingerprints?.length
                  ? employee.fingerprints
                      .map((fp) => `${fp.device.code || fp.device.name}: ${fp.fingerprintId}`)
                      .join('، ')
                  : '—'
              }
            />
            <InfoRow
              icon={employee.workType === 'SHIFTS' ? Moon : Sun}
              label="نوع الدوام"
              value={WORK_TYPE_LABEL[employee.workType] ?? employee.workType}
            />
            <InfoRow
              icon={Wallet}
              label="رصيد الإجازات (مسجل)"
              value={String(employee.leaveBalance)}
            />
            {employee.balanceStartDate && (
              <InfoRow
                icon={Calendar}
                label="تاريخ بداية الرصيد"
                value={new Date(employee.balanceStartDate).toLocaleDateString('ar-EG')}
              />
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'leaves' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="text-lg font-semibold">طلبات الإجازة</h2>
            <Button size="sm" asChild>
              <Link href={`/dashboard/leaves?employeeId=${id}`}>طلب إجازة</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {leaves.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="لا توجد طلبات إجازة"
                description="لم يُسجّل لهذا الموظف أي طلب إجازة"
                actionLabel="طلب إجازة"
                onAction={() => router.push(`/dashboard/leaves?employeeId=${id}`)}
                compact
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-right">
                      <th className="p-3 font-medium text-gray-700">النوع</th>
                      <th className="p-3 font-medium text-gray-700">من</th>
                      <th className="p-3 font-medium text-gray-700">إلى</th>
                      <th className="p-3 font-medium text-gray-700">الأيام</th>
                      <th className="p-3 font-medium text-gray-700">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((req) => (
                      <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="p-3">{req.leaveType?.nameAr ?? '—'}</td>
                        <td className="p-3">{new Date(req.startDate).toLocaleDateString('ar-EG')}</td>
                        <td className="p-3">{new Date(req.endDate).toLocaleDateString('ar-EG')}</td>
                        <td className="p-3">{req.daysCount}</td>
                        <td className="p-3">
                          <Badge
                            variant={
                              req.status === 'APPROVED'
                                ? 'success'
                                : req.status === 'REJECTED'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {req.status === 'PENDING' && 'معلق'}
                            {req.status === 'APPROVED' && 'معتمد'}
                            {req.status === 'REJECTED' && 'مرفوض'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'absences' && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">سجل الغيابات</h2>
          </CardHeader>
          <CardContent>
            {absences.length === 0 ? (
              <EmptyState
                icon={UserX}
                title="لا توجد غيابات مسجلة"
                description="لم يُسجّل لهذا الموظف أي غياب"
                compact
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-right">
                      <th className="p-3 font-medium text-gray-700">التاريخ</th>
                      <th className="p-3 font-medium text-gray-700">السبب</th>
                      <th className="p-3 font-medium text-gray-700">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absences.map((a) => (
                      <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="p-3">
                          {new Date(a.date).toLocaleDateString('ar-EG', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-3">{a.reason ?? '—'}</td>
                        <td className="p-3">
                          <Badge variant={a.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
                            {a.status === 'RECORDED' ? 'مسجل' : 'ملغى'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'schedule' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h2 className="text-lg font-semibold">جدول الدوام</h2>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/dashboard/schedules?employeeId=${id}`}>جداول الدوام</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!employee.workSchedule ? (
              <EmptyState
                icon={ClipboardList}
                title="لا يوجد جدول لهذا الشهر"
                description="جدول الدوام الحالي غير معرّف. يمكن تعيينه من صفحة جداول الدوام."
                actionLabel="فتح جداول الدوام"
                onAction={() => router.push(`/dashboard/schedules?employeeId=${id}`)}
                compact
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow
                  icon={employee.workSchedule.workType === 'SHIFTS' ? Moon : Sun}
                  label="نوع الدوام"
                  value={WORK_TYPE_LABEL[employee.workSchedule.workType] ?? employee.workSchedule.workType}
                />
                <InfoRow label="الحالة" value={employee.workSchedule.status === 'APPROVED' ? 'معتمد' : 'معلق'} />
                <InfoRow label="من" value={employee.workSchedule.startTime} />
                <InfoRow label="إلى" value={employee.workSchedule.endTime} />
                {employee.workSchedule.daysOfWeek && (
                  <InfoRow label="أيام العمل" value={employee.workSchedule.daysOfWeek} />
                )}
                {employee.workSchedule.shiftPattern && (
                  <InfoRow label="نمط التناوب" value={employee.workSchedule.shiftPattern} />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'balance' && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">رصيد الإجازات الاعتيادية</h2>
            <p className="text-sm text-gray-500 mt-0.5">يُحدّث تلقائياً حتى تاريخ اليوم — عند كل تحميل للصفحة</p>
          </CardHeader>
          <CardContent>
            {balanceInfo == null ? (
              <TableSkeleton rows={3} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4">
                  <p className="text-sm text-primary-700 font-medium">رصيد الإجازات الاعتيادية (المعتمد)</p>
                  <p className="text-2xl font-bold text-primary-900 mt-1">
                    {Math.floor(balanceInfo.totalBalanceCumulative)}
                  </p>
                  <p className="text-xs text-primary-600 mt-1">يوم — يُحدّث تلقائياً حتى اليوم</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-600 font-medium">الرصيد المسجل (أساس)</p>
                  <p className="text-xl font-semibold text-gray-900 mt-1">{balanceInfo.baseBalance}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-600 font-medium">استحقاق شهري</p>
                  <p className="text-xl font-semibold text-gray-900 mt-1">{balanceInfo.accrualPerMonth}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-600 font-medium">أيام إجازة هذا الشهر</p>
                  <p className="text-xl font-semibold text-gray-900 mt-1">
                    {balanceInfo.leaveDaysInCurrentMonth}
                  </p>
                </div>
                {balanceInfo.balanceStartDate && (
                  <div className="rounded-xl border border-gray-200 p-4 sm:col-span-2">
                    <p className="text-sm text-gray-600 font-medium">تاريخ بداية الاحتساب</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {new Date(balanceInfo.balanceStartDate).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <div className="mt-0.5 rounded-lg bg-gray-100 p-2">
          <Icon className="h-4 w-4 text-gray-600" />
        </div>
      )}
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-gray-200', className)} />;
}
