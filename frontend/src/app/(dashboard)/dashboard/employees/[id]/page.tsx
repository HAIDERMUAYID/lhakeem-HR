'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  AlertCircle,
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { TableSkeleton } from '@/components/shared/page-skeleton';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { cn, formatDeptUnit } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useBreadcrumbTitle } from '@/contexts/breadcrumb-title';

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
  unit?: { id: string; name: string } | null;
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

type LeaveTypeForBalance = {
  id: string;
  nameAr: string;
  name: string;
  deductFromBalance: boolean;
  monthlyAccrual?: number | null;
};

type CumulativeBalanceResponse = {
  baselineBalance: number;
  baselineDate: string | null;
  accruedAfterBaseline: number;
  consumedAfterBaseline: number;
  currentBalance: number;
  monthlyAccrual: number;
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
  { id: 'cumulative', label: 'الرصيد التراكمي', icon: Wallet },
] as const;

export default function EmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('basic');
  const [addLeaveOpen, setAddLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: '',
    startDate: '',
    startTime: '',
    hoursCount: '2',
    daysCount: '2',
    reason: '',
  });
  const [leaveLocalDays, setLeaveLocalDays] = useState('2');
  const [leaveLocalHours, setLeaveLocalHours] = useState('2');
  const { setLastSegmentLabel } = useBreadcrumbTitle();

  const { data: employee, isLoading, error, refetch } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => apiGet<Employee>(`/api/employees/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (employee?.fullName) setLastSegmentLabel(employee.fullName);
    return () => setLastSegmentLabel(null);
  }, [employee?.fullName, setLastSegmentLabel]);

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

  const { data: leaveTypesData } = useQuery({
    queryKey: ['leave-types-for-balance'],
    queryFn: () => apiGet<LeaveTypeForBalance[]>('/api/leave-types'),
    enabled: !!id && (tab === 'cumulative' || addLeaveOpen),
    staleTime: 5 * 60 * 1000,
  });

  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState<string>('');
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const [baselineBalanceInput, setBaselineBalanceInput] = useState<string>('');
  const [baselineDateInput, setBaselineDateInput] = useState<string>(todayStr);
  const [consumedAfterInput, setConsumedAfterInput] = useState<string>('');

  const effectiveLeaveTypes =
    leaveTypesData?.filter((t) => t.deductFromBalance) ?? [];

  const currentLeaveType =
    effectiveLeaveTypes.find((t) => t.id === selectedLeaveTypeId) ??
    effectiveLeaveTypes[0];

  const cumulativeQueryEnabled =
    !!id && !!currentLeaveType && tab === 'cumulative';

  const parsedBaseline = Number(baselineBalanceInput || '0');
  const parsedConsumed = Number(consumedAfterInput || '0');
  const monthlyAccrualForType = currentLeaveType?.monthlyAccrual ?? 0;

  let previewAccrued = 0;
  if (baselineDateInput) {
    const start = new Date(baselineDateInput);
    const end = today;
    const yearsDiff = end.getFullYear() - start.getFullYear();
    const monthsDiffRaw = yearsDiff * 12 + (end.getMonth() - start.getMonth());
    const daysDiff = end.getDate() - start.getDate();
    const monthsDiff = Math.max(0, monthsDiffRaw + daysDiff / 30);
    previewAccrued = monthsDiff * monthlyAccrualForType;
  }

  const previewCurrentBalance =
    (Number.isFinite(parsedBaseline) ? parsedBaseline : 0) +
    previewAccrued -
    (Number.isFinite(parsedConsumed) ? parsedConsumed : 0);

  const { data: cumulativeBalance, refetch: refetchCumulative, isFetching: isFetchingCumulative } =
    useQuery({
      queryKey: ['cumulative-balance', id, currentLeaveType?.id],
      queryFn: () =>
        apiGet<CumulativeBalanceResponse>(
          `/api/leave-requests/cumulative-balance?employeeId=${id}&leaveTypeId=${currentLeaveType?.id}&asOf=${todayStr}`,
        ),
      enabled: cumulativeQueryEnabled,
      staleTime: 0,
      refetchOnWindowFocus: true,
    });

  const saveBaselineMutation = useMutation({
    mutationFn: (body: {
      employeeId: string;
      leaveTypeId: string;
      baselineDate: string;
      baselineBalance: number;
    }) => apiPost('/api/leave-requests/cumulative-baseline', body),
    onSuccess: () => {
      toast.success('تم حفظ الرصيد التراكمي بنجاح');
      refetchCumulative();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const addLeaveMutation = useMutation({
    mutationFn: (body: {
      employeeId: string;
      leaveTypeId: string;
      startDate: string;
      startTime?: string;
      hoursCount?: number;
      daysCount?: number;
      reason?: string;
    }) => apiPost('/api/leave-requests', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests', 'employee', id] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      setAddLeaveOpen(false);
      setLeaveForm({ leaveTypeId: '', startDate: '', startTime: '', hoursCount: '2', daysCount: '2', reason: '' });
      setLeaveLocalDays('2');
      setLeaveLocalHours('2');
      toast.success('تم إرسال طلب الإجازة بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!id) {
    return (
      <div className="py-12 text-center text-gray-500">
        <p>معرف الموظف غير متوفر.</p>
        <Button variant="outline" className="mt-4 min-h-[44px]" asChild>
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
        <Button variant="outline" className="min-h-[44px]" asChild>
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
      className="space-y-6 overflow-x-hidden max-w-full"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white">
            <UserCircle className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{employee.fullName}</h1>
            <p className="text-gray-500">
              {employee.jobTitle} • {formatDeptUnit({ departmentName: employee.department?.name, unitName: employee.unit?.name })}
            </p>
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
          <Button variant="outline" size="sm" asChild className="min-h-[44px]">
            <Link href="/dashboard/employees" className="gap-2">
              <ArrowRight className="h-4 w-4" />
              الموظفين
            </Link>
          </Button>
          <Button size="sm" className="min-h-[44px] gap-2" onClick={() => setAddLeaveOpen(true)}>
            <CalendarCheck className="h-4 w-4" />
            طلب إجازة
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
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px]',
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
            <InfoRow
              icon={Building2}
              label="القسم/الوحدة"
              value={formatDeptUnit({ departmentName: employee.department?.name, unitName: employee.unit?.name })}
            />
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
            <Button size="sm" className="min-h-[44px]" onClick={() => setAddLeaveOpen(true)}>
              طلب إجازة
            </Button>
          </CardHeader>
          <CardContent>
            {leaves.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="لا توجد طلبات إجازة"
                description="لم يُسجّل لهذا الموظف أي طلب إجازة"
                actionLabel="طلب إجازة"
                onAction={() => setAddLeaveOpen(true)}
                compact
              />
            ) : (
              <div className="overflow-x-auto max-w-full">
                <table className="w-full text-sm min-w-[320px]">
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
              <div className="overflow-x-auto max-w-full">
                <table className="w-full text-sm min-w-[280px]">
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

      {tab === 'cumulative' && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">الرصيد التراكمي للإجازات</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              أدخل رصيداً تراكمياً سابقاً وتاريخاً مرجعياً، ثم أدخل عدد الأيام التي استمتع بها الموظف
              بعد هذا التاريخ حتى اليوم، وسيحسب النظام الرصيد الحالي مع الاستحقاق الشهري.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1 space-y-2">
                <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">
                  1. نوع الإجازة
                </p>
                {effectiveLeaveTypes.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    لا توجد أنواع إجازات مفعّلة تُخصم من الرصيد.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white min-h-[44px]"
                      value={currentLeaveType?.id ?? ''}
                      onChange={(e) => setSelectedLeaveTypeId(e.target.value)}
                    >
                      {effectiveLeaveTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nameAr} {t.monthlyAccrual != null ? `• ${t.monthlyAccrual} يوم/شهر` : ''}
                        </option>
                      ))}
                    </select>
                    {currentLeaveType?.monthlyAccrual != null && (
                      <p className="text-xs text-gray-500">
                        الاستحقاق الشهري لهذا النوع: {currentLeaveType.monthlyAccrual} يوم.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="sm:col-span-1 space-y-2">
                <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">
                  2. الرصيد السابق حتى تاريخ
                </p>
                <div className="space-y-2">
                  <label className="block text-xs text-gray-500">الرصيد التراكمي السابق (أيام)</label>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white min-h-[44px]"
                    value={baselineBalanceInput}
                    onChange={(e) => setBaselineBalanceInput(e.target.value)}
                    placeholder="مثال: 5"
                  />
                  <label className="block text-xs text-gray-500">لغاية التاريخ</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white min-h-[44px]"
                    value={baselineDateInput}
                    onChange={(e) => setBaselineDateInput(e.target.value)}
                    max={todayStr}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    بعد هذه النقطة سيتم احتساب الاستحقاق تلقائياً شهرياً.
                  </p>
                </div>
              </div>

              <div className="sm:col-span-1 space-y-2">
                <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">
                  3. الإجازات بعد التاريخ المرجعي
                </p>
                <p className="text-xs text-gray-500">
                  أدخل عدد الأيام التي استمتع بها الموظف كإجازات من تاريخ{' '}
                  {baselineDateInput || '—'} حتى اليوم ({today.toLocaleDateString('ar-EG')}).
                </p>
                <input
                  type="number"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white min-h-[44px]"
                  value={consumedAfterInput}
                  onChange={(e) => setConsumedAfterInput(e.target.value)}
                  placeholder="مثال: 4"
                  min={0}
                />
                <p className="text-xs text-gray-500 mt-1">
                  يمكن لاحقاً الاعتماد على الطلبات المسجلة في النظام، لكن حالياً هذا الرقم يدخله المستخدم يدوياً.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-4">
              <p className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary-600" />
                النتيجة الحالية حتى اليوم ({today.toLocaleDateString('ar-EG')})
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-4">
                  <p className="text-xs text-primary-700 font-medium">الرصيد الحالي (محسوب الآن)</p>
                  <p className="text-2xl font-bold text-primary-900 mt-1">
                    {Number.isFinite(previewCurrentBalance) ? previewCurrentBalance.toFixed(2) : '—'} يوم
                  </p>
                  <p className="text-[11px] text-primary-700 mt-1">
                    يمكن أن يكون الرصيد سالباً — سيتم اعتماد هذه القيمة كنقطة بداية جديدة.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-600 font-medium">الرصيد عند التاريخ المرجعي</p>
                  <p className="text-xl font-semibold text-gray-900 mt-1">
                    {Number.isFinite(parsedBaseline) ? parsedBaseline.toFixed(2) : '—'} يوم
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    حتى {baselineDateInput || '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-600 font-medium">استحقاق بعد التاريخ المرجعي</p>
                  <p className="text-xl font-semibold text-gray-900 mt-1">
                    {previewAccrued.toFixed(2)} يوم
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    وفق الاستحقاق الشهري {monthlyAccrualForType} يوم/شهر.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-600 font-medium">أيام الإجازة بعد التاريخ المرجعي (مدخلة يدوياً)</p>
                  <p className="text-xl font-semibold text-gray-900 mt-1">
                    {Number.isFinite(parsedConsumed) ? parsedConsumed.toFixed(2) : '0.00'} يوم
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium min-h-[44px] w-full sm:w-auto',
                    'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                  disabled={
                    !currentLeaveType ||
                    !baselineDateInput ||
                    baselineBalanceInput.trim() === '' ||
                    !Number.isFinite(previewCurrentBalance) ||
                    saveBaselineMutation.isPending
                  }
                  onClick={() => {
                    const val = previewCurrentBalance;
                    if (!Number.isFinite(val)) {
                      toast.error('الرجاء إدخال قيم صحيحة للحساب');
                      return;
                    }
                    saveBaselineMutation.mutate({
                      employeeId: id,
                      leaveTypeId: currentLeaveType.id,
                      // نعتمد الرصيد المحسوب كنقطة بداية من تاريخ اليوم
                      baselineDate: todayStr,
                      baselineBalance: val,
                    });
                  }}
                >
                  {saveBaselineMutation.isPending ? 'جاري الحفظ...' : 'حفظ الرصيد كنقطة بداية جديدة'}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal
        open={addLeaveOpen}
        onClose={() => setAddLeaveOpen(false)}
        title="طلب إجازة للموظف"
        className="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const allTypes = leaveTypesData ?? [];
            const selected = allTypes.find((t) => t.id === leaveForm.leaveTypeId);
            const isTemporal = selected?.nameAr?.includes('زمنية') ?? false;
            const hoursVal = isTemporal ? Math.min(4, Math.max(1, Number(leaveForm.hoursCount) || 1)) : undefined;
            const daysVal = !isTemporal ? (Number(leaveForm.daysCount) || 0) : undefined;
            if (!leaveForm.leaveTypeId || !leaveForm.startDate) {
              toast.error('اختر نوع الإجازة وتاريخ البداية');
              return;
            }
            if (isTemporal && !leaveForm.startTime) {
              toast.error('الإجازة الزمنية تتطلب ساعة البداية');
              return;
            }
            if (!isTemporal && (!daysVal || daysVal < 1)) {
              toast.error('أدخل عدد الأيام');
              return;
            }
            addLeaveMutation.mutate({
              employeeId: id,
              leaveTypeId: leaveForm.leaveTypeId,
              startDate: leaveForm.startDate,
              startTime: isTemporal ? leaveForm.startTime : undefined,
              hoursCount: hoursVal,
              daysCount: daysVal,
              reason: leaveForm.reason || undefined,
            });
          }}
          className="space-y-4"
        >
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
            <p className="text-xs font-medium text-gray-500">الموظف</p>
            <p className="font-semibold text-gray-900">{employee?.fullName}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">نوع الإجازة *</label>
            <select
              value={leaveForm.leaveTypeId}
              onChange={(e) => setLeaveForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
              required
            >
              <option value="">— اختر النوع —</option>
              {(leaveTypesData ?? []).map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.nameAr}</option>
              ))}
            </select>
          </div>

          {(() => {
            const selected = (leaveTypesData ?? []).find((t) => t.id === leaveForm.leaveTypeId);
            const isTemporalLeave = selected?.nameAr?.includes('زمنية') ?? false;
            if (isTemporalLeave) {
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">التاريخ *</label>
                      <Input
                        type="date"
                        value={leaveForm.startDate}
                        onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))}
                        required
                        className="rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">ساعة البداية *</label>
                      <Input
                        type="time"
                        value={leaveForm.startTime}
                        onChange={(e) => setLeaveForm((f) => ({ ...f, startTime: e.target.value }))}
                        required
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">المدة (ساعات، ١–٤) *</label>
                    <div className="flex gap-2 flex-wrap">
                      {[1, 2, 3, 4].map((h) => (
                        <Button
                          key={h}
                          type="button"
                          variant={Number(leaveLocalHours) === h ? 'default' : 'outline'}
                          size="sm"
                          className="rounded-lg"
                          onClick={() => {
                            setLeaveLocalHours(String(h));
                            setLeaveForm((f) => ({ ...f, hoursCount: String(h) }));
                          }}
                        >
                          {h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${h} ساعات`}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              );
            }
            return (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">تاريخ البداية *</label>
                    <Input
                      type="date"
                      value={leaveForm.startDate}
                      onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))}
                      required
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">عدد الأيام *</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={leaveLocalDays}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '');
                        setLeaveLocalDays(v);
                        setLeaveForm((f) => ({ ...f, daysCount: v }));
                      }}
                      placeholder="2"
                      required
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </>
            );
          })()}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">السبب (اختياري)</label>
            <Input
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="السبب"
              className="rounded-xl"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAddLeaveOpen(false)} className="rounded-xl">
              إلغاء
            </Button>
            <Button type="submit" disabled={addLeaveMutation.isPending} className="rounded-xl">
              {addLeaveMutation.isPending ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </Button>
          </div>
        </form>
      </Modal>
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
