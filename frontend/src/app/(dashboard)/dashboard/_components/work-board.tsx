'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Calendar,
  Check,
  Pencil,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api';
import { hasAnyPermission } from '@/lib/permissions';
import { formatDeptUnit } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { TableSkeleton } from '@/components/shared/page-skeleton';
import { CanDo } from '@/components/shared/can-do';
import {
  formatArDate,
  leaveDuration,
  toDateInput,
  workTypeLabel,
  type DepartmentRow,
  type EmployeeRow,
  type LeaveRow,
} from '../_lib';

type Tab = 'leaves' | 'employees' | 'departments';

const PAGE_SIZE = 8;

const TAB_META: Record<
  Tab,
  { label: string; href: string; search: string; icon: typeof Calendar }
> = {
  leaves: {
    label: 'إجازات قيد الانتظار',
    href: '/dashboard/leaves?status=PENDING',
    search: 'بحث بالموظف أو نوع الإجازة...',
    icon: Calendar,
  },
  employees: {
    label: 'الموظفون',
    href: '/dashboard/employees',
    search: 'بحث بالاسم أو العنوان الوظيفي...',
    icon: Users,
  },
  departments: {
    label: 'الأقسام',
    href: '/dashboard/departments',
    search: 'بحث باسم القسم...',
    icon: Building2,
  },
};

export function WorkBoard({ permissions }: { permissions: string[] }) {
  const available = useMemo(() => {
    const tabs: Tab[] = [];
    if (hasAnyPermission(permissions, 'LEAVES_VIEW')) tabs.push('leaves');
    if (hasAnyPermission(permissions, 'EMPLOYEES_VIEW')) tabs.push('employees');
    if (hasAnyPermission(permissions, 'DEPARTMENTS_VIEW')) tabs.push('departments');
    return tabs;
  }, [permissions]);

  const [tab, setTab] = useState<Tab | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { data: leaveStats } = useQuery({
    queryKey: ['leave-requests-stats'],
    enabled: available.includes('leaves'),
    queryFn: () => apiGet<{ pending: number }>('/api/leave-requests/stats'),
  });

  const preferred: Tab | undefined =
    (leaveStats?.pending ?? 0) > 0 && available.includes('leaves')
      ? 'leaves'
      : available.includes('employees')
        ? 'employees'
        : available[0];
  const activeTab = (tab && available.includes(tab) ? tab : preferred) as Tab | undefined;

  if (!activeTab) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Users}
            title="لا توجد بيانات لإدارتها من هنا"
            description="صلاحياتك الحالية لا تشمل الإجازات أو الموظفين أو الأقسام."
            compact
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-4 sm:px-5 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">لوحة العمل</h2>
            <p className="text-sm text-gray-500">عدّل أو احذف مباشرة دون مغادرة الصفحة</p>
          </div>
          <Link
            href={TAB_META[activeTab].href}
            className="text-sm font-medium text-primary-700 hover:underline self-start sm:self-auto"
          >
            عرض الكل
          </Link>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-px -mb-px">
          {available.map((id) => {
            const meta = TAB_META[id];
            const Icon = meta.icon;
            const selected = id === activeTab;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  setSearch('');
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-colors whitespace-nowrap ${
                  selected
                    ? 'border-primary-700 text-primary-800 bg-primary-50/60'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {meta.label}
                {id === 'leaves' && (leaveStats?.pending ?? 0) > 0 && (
                  <span className="rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold px-1.5 py-0.5 tabular-nums">
                    {leaveStats?.pending}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 sm:p-5 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={TAB_META[activeTab].search}
            className="pr-10"
          />
        </div>
      </div>

      {activeTab === 'leaves' && <LeavesInbox search={debouncedSearch} />}
      {activeTab === 'employees' && <EmployeesInbox search={debouncedSearch} />}
      {activeTab === 'departments' && <DepartmentsInbox search={debouncedSearch} />}
    </Card>
  );
}

function LeavesInbox({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const [edit, setEdit] = useState<LeaveRow | null>(null);
  const [remove, setRemove] = useState<LeaveRow | null>(null);
  const [decide, setDecide] = useState<{ row: LeaveRow; action: 'approve' | 'reject' } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['leave-requests', { status: 'PENDING', search, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<{ data: LeaveRow[]; total: number }>(
        `/api/leave-requests?status=PENDING&page=1&limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}`,
      ),
  });

  const { data: leaveTypes } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => apiGet<{ id: string; nameAr: string }[]>('/api/leave-types'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
    queryClient.invalidateQueries({ queryKey: ['leave-requests-stats'] });
    queryClient.invalidateQueries({ queryKey: ['leave-requests-pending'] });
  };

  const editMutation = useMutation({
    mutationFn: (body: {
      id: string;
      leaveTypeId: string;
      startDate: string;
      daysCount: number;
      hoursCount?: number;
      reason: string;
    }) =>
      apiPatch(`/api/leave-requests/${body.id}`, {
        leaveTypeId: body.leaveTypeId,
        startDate: body.startDate,
        daysCount: body.daysCount,
        hoursCount: body.hoursCount,
        reason: body.reason,
      }),
    onSuccess: () => {
      toast.success('تم تعديل طلب الإجازة');
      setEdit(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/leave-requests/${id}`),
    onSuccess: () => {
      toast.success('تم حذف طلب الإجازة');
      setRemove(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      apiPost(`/api/leave-requests/${id}/${action}`, {}),
    onSuccess: (_, vars) => {
      toast.success(vars.action === 'approve' ? 'تم اعتماد الإجازة' : 'تم رفض الإجازة');
      setDecide(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = data?.data ?? [];

  return (
    <>
      <InboxBody
        loading={isLoading}
        error={error ? (error as Error).message : null}
        onRetry={() => refetch()}
        empty={rows.length === 0}
        emptyTitle={search ? 'لا نتائج مطابقة' : 'لا توجد إجازات تنتظر قرارك'}
        emptyDescription={search ? 'جرّب اسماً آخر أو امسح البحث.' : 'عند ورود طلب جديد سيظهر هنا للتعديل أو الحذف أو الاعتماد.'}
        emptyIcon={Calendar}
      >
        <ul className="divide-y divide-gray-100">
          {rows.map((row) => (
            <li key={row.id} className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate">{row.employee.fullName}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {row.leaveType.nameAr} · {leaveDuration(row.daysCount, row.hoursCount)} ·{' '}
                  {formatArDate(row.startDate)} — {formatArDate(row.endDate)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDeptUnit({
                    departmentName: row.employee.department?.name,
                    unitName: row.employee.unit?.name,
                  })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CanDo permission={['LEAVES_CREATE', 'LEAVES_APPROVE']}>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" />
                    تعديل
                  </Button>
                </CanDo>
                <CanDo permission="LEAVES_APPROVE">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    onClick={() => setDecide({ row, action: 'approve' })}
                  >
                    <Check className="h-3.5 w-3.5" />
                    اعتماد
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-gray-600"
                    onClick={() => setDecide({ row, action: 'reject' })}
                  >
                    <X className="h-3.5 w-3.5" />
                    رفض
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50"
                    onClick={() => setRemove(row)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </Button>
                </CanDo>
              </div>
            </li>
          ))}
        </ul>
        {typeof data?.total === 'number' && data.total > rows.length && (
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
            يظهر {rows.length} من {data.total} طلبات.{' '}
            <Link href="/dashboard/leaves?status=PENDING" className="text-primary-700 font-medium hover:underline">
              عرض البقية
            </Link>
          </div>
        )}
      </InboxBody>

      <LeaveEditModal
        row={edit}
        types={leaveTypes ?? []}
        loading={editMutation.isPending}
        onClose={() => setEdit(null)}
        onSave={(body) => editMutation.mutate(body)}
      />

      <ConfirmDialog
        open={!!remove}
        onOpenChange={(open) => !open && setRemove(null)}
        title="حذف طلب الإجازة"
        description={
          remove
            ? `سيتم حذف إجازة ${remove.employee.fullName} (${formatArDate(remove.startDate)}). لا يمكن التراجع.`
            : undefined
        }
        confirmLabel="حذف"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (remove) await deleteMutation.mutateAsync(remove.id);
        }}
      />

      <ConfirmDialog
        open={!!decide}
        onOpenChange={(open) => !open && setDecide(null)}
        title={decide?.action === 'approve' ? 'اعتماد الإجازة' : 'رفض الإجازة'}
        description={
          decide
            ? `${decide.action === 'approve' ? 'اعتماد' : 'رفض'} إجازة ${decide.row.employee.fullName}؟`
            : undefined
        }
        confirmLabel={decide?.action === 'approve' ? 'اعتماد' : 'رفض'}
        variant={decide?.action === 'reject' ? 'danger' : 'default'}
        loading={decideMutation.isPending}
        onConfirm={async () => {
          if (decide) await decideMutation.mutateAsync({ id: decide.row.id, action: decide.action });
        }}
      />
    </>
  );
}

function LeaveEditModal({
  row,
  types,
  loading,
  onClose,
  onSave,
}: {
  row: LeaveRow | null;
  types: { id: string; nameAr: string }[];
  loading: boolean;
  onClose: () => void;
  onSave: (body: {
    id: string;
    leaveTypeId: string;
    startDate: string;
    daysCount: number;
    hoursCount?: number;
    reason: string;
  }) => void;
}) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [daysCount, setDaysCount] = useState('1');
  const [reason, setReason] = useState('');

  const open = !!row;

  useEffect(() => {
    if (!row) return;
    setLeaveTypeId(row.leaveType.id);
    setStartDate(toDateInput(row.startDate));
    setDaysCount(String(row.daysCount));
    setReason(row.reason ?? '');
  }, [row]);

  return (
    <Modal open={open} onClose={onClose} title="تعديل طلب الإجازة">
      {row && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const days = Number(daysCount);
            if (!leaveTypeId || !startDate || !Number.isFinite(days) || days <= 0) {
              toast.error('أكمل النوع والتاريخ وعدد الأيام');
              return;
            }
            onSave({
              id: row.id,
              leaveTypeId,
              startDate,
              daysCount: days,
              hoursCount: row.hoursCount ?? undefined,
              reason,
            });
          }}
        >
          <p className="text-sm text-gray-500">
            الموظف: <span className="font-medium text-gray-800">{row.employee.fullName}</span>
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">نوع الإجازة</label>
            <Select
              value={leaveTypeId}
              onChange={setLeaveTypeId}
              options={types.map((t) => ({ value: t.id, label: t.nameAr }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">تاريخ البداية</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">عدد الأيام</label>
              <Input
                type="number"
                min={1}
                step={1}
                value={daysCount}
                onChange={(e) => setDaysCount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">السبب (اختياري)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="flex min-h-[88px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base shadow-[0_1px_2px_rgba(16,24,40,0.04)] placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ التعديل'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function EmployeesInbox({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const [edit, setEdit] = useState<EmployeeRow | null>(null);
  const [remove, setRemove] = useState<EmployeeRow | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', { search, limit: PAGE_SIZE, dashboard: true }],
    queryFn: () =>
      apiGet<{ data: EmployeeRow[]; total: number }>(
        `/api/employees?page=1&limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}`,
      ),
  });

  const { data: depts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/departments'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    queryClient.invalidateQueries({ queryKey: ['employees-stats'] });
  };

  const editMutation = useMutation({
    mutationFn: (body: {
      id: string;
      fullName: string;
      jobTitle: string;
      departmentId: string;
      workType: 'MORNING' | 'SHIFTS';
    }) =>
      apiPut(`/api/employees/${body.id}`, {
        fullName: body.fullName,
        jobTitle: body.jobTitle,
        departmentId: body.departmentId,
        workType: body.workType,
      }),
    onSuccess: () => {
      toast.success('تم تعديل بيانات الموظف');
      setEdit(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiPut(`/api/employees/${id}`, { isActive: false }),
    onSuccess: () => {
      toast.success('تم إيقاف الموظف');
      setRemove(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = data?.data ?? [];

  return (
    <>
      <InboxBody
        loading={isLoading}
        error={error ? (error as Error).message : null}
        onRetry={() => refetch()}
        empty={rows.length === 0}
        emptyTitle={search ? 'لا نتائج مطابقة' : 'لا يوجد موظفون'}
        emptyDescription="أضف موظفاً من صفحة الموظفين ثم عد إلى هنا لإدارته."
        emptyIcon={Users}
      >
        <ul className="divide-y divide-gray-100">
          {rows.map((row) => (
            <li key={row.id} className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 truncate">{row.fullName}</p>
                  <Badge variant={row.isActive ? 'success' : 'warning'}>
                    {row.isActive ? 'نشط' : 'متوقف'}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {row.jobTitle || 'بدون عنوان'} · {workTypeLabel(row.workType)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDeptUnit({
                    departmentName: row.department?.name,
                    unitName: row.unit?.name,
                  })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CanDo permission="EMPLOYEES_MANAGE">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" />
                    تعديل
                  </Button>
                  {row.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50"
                      onClick={() => setRemove(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                  )}
                </CanDo>
              </div>
            </li>
          ))}
        </ul>
        {typeof data?.total === 'number' && data.total > rows.length && (
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
            يظهر {rows.length} من {data.total}.{' '}
            <Link href="/dashboard/employees" className="text-primary-700 font-medium hover:underline">
              عرض البقية
            </Link>
          </div>
        )}
      </InboxBody>

      <EmployeeEditModal
        row={edit}
        depts={depts ?? []}
        loading={editMutation.isPending}
        onClose={() => setEdit(null)}
        onSave={(body) => editMutation.mutate(body)}
      />

      <ConfirmDialog
        open={!!remove}
        onOpenChange={(open) => !open && setRemove(null)}
        title="إيقاف الموظف"
        description={
          remove
            ? `سيتم إيقاف ${remove.fullName} ولن يظهر في القوائم النشطة. يمكن إعادة تفعيله لاحقاً من صفحة الموظفين.`
            : undefined
        }
        confirmLabel="إيقاف"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (remove) await deleteMutation.mutateAsync(remove.id);
        }}
      />
    </>
  );
}

function EmployeeEditModal({
  row,
  depts,
  loading,
  onClose,
  onSave,
}: {
  row: EmployeeRow | null;
  depts: { id: string; name: string }[];
  loading: boolean;
  onClose: () => void;
  onSave: (body: {
    id: string;
    fullName: string;
    jobTitle: string;
    departmentId: string;
    workType: 'MORNING' | 'SHIFTS';
  }) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [workType, setWorkType] = useState<'MORNING' | 'SHIFTS'>('MORNING');

  useEffect(() => {
    if (!row) return;
    setFullName(row.fullName);
    setJobTitle(row.jobTitle ?? '');
    setDepartmentId(row.department.id);
    setWorkType(row.workType === 'SHIFTS' ? 'SHIFTS' : 'MORNING');
  }, [row]);

  return (
    <Modal open={!!row} onClose={onClose} title="تعديل الموظف">
      {row && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!fullName.trim() || !departmentId) {
              toast.error('الاسم والقسم مطلوبان');
              return;
            }
            onSave({
              id: row.id,
              fullName: fullName.trim(),
              jobTitle: jobTitle.trim(),
              departmentId,
              workType,
            });
          }}
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">الاسم الكامل</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">العنوان الوظيفي</label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">القسم</label>
            <Select
              value={departmentId}
              onChange={setDepartmentId}
              options={depts.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">نوع الدوام</label>
            <Select
              value={workType}
              onChange={(v) => setWorkType(v === 'SHIFTS' ? 'SHIFTS' : 'MORNING')}
              options={[
                { value: 'MORNING', label: 'صباحي' },
                { value: 'SHIFTS', label: 'خفارات' },
              ]}
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ التعديل'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function DepartmentsInbox({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const [edit, setEdit] = useState<DepartmentRow | null>(null);
  const [remove, setRemove] = useState<DepartmentRow | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['departments', { search, dashboard: true }],
    queryFn: () =>
      apiGet<DepartmentRow[]>(
        `/api/departments?activeOnly=false&search=${encodeURIComponent(search)}`,
      ),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['departments'] });
    queryClient.invalidateQueries({ queryKey: ['departments-stats'] });
  };

  const editMutation = useMutation({
    mutationFn: (body: { id: string; name: string; code: string }) =>
      apiPut(`/api/departments/${body.id}`, { name: body.name, code: body.code || undefined }),
    onSuccess: () => {
      toast.success('تم تعديل القسم');
      setEdit(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiPut(`/api/departments/${id}`, { isActive: false }),
    onSuccess: () => {
      toast.success('تم إيقاف القسم');
      setRemove(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sorted = [...(data ?? [])].sort((a, b) => {
    const aOff = a.isActive === false ? 1 : 0;
    const bOff = b.isActive === false ? 1 : 0;
    return aOff - bOff;
  });
  const rows = sorted.slice(0, PAGE_SIZE);
  const total = data?.length ?? 0;

  return (
    <>
      <InboxBody
        loading={isLoading}
        error={error ? (error as Error).message : null}
        onRetry={() => refetch()}
        empty={rows.length === 0}
        emptyTitle={search ? 'لا نتائج مطابقة' : 'لا توجد أقسام'}
        emptyDescription="أضف قسماً من صفحة الأقسام لإدارته من هنا."
        emptyIcon={Building2}
      >
        <ul className="divide-y divide-gray-100">
          {rows.map((row) => (
            <li key={row.id} className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 truncate">{row.name}</p>
                  {row.isActive === false && <Badge variant="warning">متوقف</Badge>}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {row.code ? `الرمز ${row.code} · ` : ''}
                  {row._count?.employees ?? 0} موظف
                  {row.managerUser?.name ? ` · المسؤول ${row.managerUser.name}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CanDo permission="DEPARTMENTS_MANAGE">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" />
                    تعديل
                  </Button>
                  {row.isActive !== false && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50"
                      onClick={() => setRemove(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                  )}
                </CanDo>
              </div>
            </li>
          ))}
        </ul>
        {total > rows.length && (
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
            يظهر {rows.length} من {total}.{' '}
            <Link href="/dashboard/departments" className="text-primary-700 font-medium hover:underline">
              عرض البقية
            </Link>
          </div>
        )}
      </InboxBody>

      <DepartmentEditModal
        row={edit}
        loading={editMutation.isPending}
        onClose={() => setEdit(null)}
        onSave={(body) => editMutation.mutate(body)}
      />

      <ConfirmDialog
        open={!!remove}
        onOpenChange={(open) => !open && setRemove(null)}
        title="إيقاف القسم"
        description={
          remove
            ? `سيتم إيقاف قسم ${remove.name}. الموظفون المرتبطون به يبقون كما هم.`
            : undefined
        }
        confirmLabel="إيقاف"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (remove) await deleteMutation.mutateAsync(remove.id);
        }}
      />
    </>
  );
}

function DepartmentEditModal({
  row,
  loading,
  onClose,
  onSave,
}: {
  row: DepartmentRow | null;
  loading: boolean;
  onClose: () => void;
  onSave: (body: { id: string; name: string; code: string }) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!row) return;
    setName(row.name);
    setCode(row.code ?? '');
  }, [row]);

  return (
    <Modal open={!!row} onClose={onClose} title="تعديل القسم">
      {row && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error('اسم القسم مطلوب');
              return;
            }
            onSave({ id: row.id, name: name.trim(), code: code.trim() });
          }}
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">اسم القسم</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">الرمز</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="اختياري" />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ التعديل'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function InboxBody({
  loading,
  error,
  onRetry,
  empty,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  empty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon: typeof Calendar;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="p-4">
        <TableSkeleton rows={4} />
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} className="py-12" />;
  }
  if (empty) {
    return (
      <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} compact />
    );
  }
  return <div>{children}</div>;
}
