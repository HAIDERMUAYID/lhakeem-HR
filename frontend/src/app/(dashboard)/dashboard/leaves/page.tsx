'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Calendar,
  FileText,
  Clock,
  Plus,
  Check,
  X,
  Search,
  Filter,
  ChevronRight,
  ChevronLeft,
  CalendarCheck,
  AlertCircle,
  Eye,
  CalendarDays,
  Trash2,
  FileDown,
} from 'lucide-react';
import Link from 'next/link';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableSkeleton } from '@/components/shared/page-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { downloadCSV } from '@/lib/export';

type LeaveRequest = {
  id: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  hoursCount?: number;
  status: string;
  reason: string | null;
  employee: { id: string; fullName: string; leaveBalance: string | number; department: { name: string } };
  leaveType: { id: string; nameAr: string };
};

type LeaveRequestsRes = { data: LeaveRequest[]; total: number };

type StatsResponse = { total: number; pending: number; approved: number; rejected: number };

const HOURS_PER_DAY = 7;

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
};

const statusLabel: Record<string, string> = {
  PENDING: 'قيد الانتظار',
  APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة',
};

const CHART_COLORS = ['#0ea5e9', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6'];
const AR_MONTHS: Record<number, string> = {
  1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل', 5: 'مايو', 6: 'يونيو',
  7: 'يوليو', 8: 'أغسطس', 9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر',
};
function formatMonthLabel(month: number, year: number) {
  return `${AR_MONTHS[month] ?? month} ${year}`;
}

function formatDuration(daysCount: number, hoursCount?: number | null): string {
  const hrs = hoursCount != null ? Number(hoursCount) : daysCount * HOURS_PER_DAY;
  const isWholeDays = Math.abs(hrs - daysCount * HOURS_PER_DAY) < 0.01 && daysCount >= 1;
  if (isWholeDays) return `${daysCount} يوم`;
  return `${hrs} ساعة`;
}

const KPI_CARDS = [
  { key: 'total', label: 'إجمالي الطلبات', icon: FileText, iconColor: 'text-slate-600', iconBg: 'bg-slate-100' },
  { key: 'pending', label: 'قيد الانتظار', icon: Clock, iconColor: 'text-amber-600', iconBg: 'bg-amber-100' },
  { key: 'approved', label: 'معتمدة', icon: Check, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100' },
  { key: 'rejected', label: 'مرفوضة', icon: X, iconColor: 'text-red-600', iconBg: 'bg-red-100' },
];

function SearchableSelect({
  value,
  onChange,
  onSelectLabel,
  options,
  placeholder,
  searchPlaceholder,
  loadOptions,
  isLoading,
  selectedLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelectLabel?: (label: string) => void;
  options: { value: string; label: string; sub?: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  loadOptions?: (search: string) => void;
  isLoading?: boolean;
  selectedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (loadOptions && open) loadOptions(debouncedSearch);
  }, [debouncedSearch, open, loadOptions]);

  const filtered = loadOptions
    ? options
    : options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.sub && o.sub.toLowerCase().includes(search.toLowerCase()))
      );
  const selected = options.find((o) => o.value === value) || (selectedLabel && value ? { label: selectedLabel } : null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-base cursor-pointer hover:border-gray-300"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.label : placeholder ?? 'اختر...'}
        </span>
        <Search className="h-4 w-4 text-gray-400 shrink-0" />
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-gray-200 bg-white shadow-lg max-h-56 overflow-hidden">
          <div className="p-2 border-b">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder ?? 'بحث...'}
              className="h-9"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-44">
            {isLoading ? (
              <p className="p-4 text-sm text-gray-500 text-center">جاري التحميل...</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 text-center">لا توجد نتائج</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    onSelectLabel?.(opt.label);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-right px-4 py-2.5 hover:bg-gray-50 flex flex-col items-start ${
                    value === opt.value ? 'bg-primary-50 text-primary-800' : ''
                  }`}
                >
                  <span className="font-medium">{opt.label}</span>
                  {opt.sub && <span className="text-xs text-gray-500">{opt.sub}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LeavesPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || '');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  /** الأيام أولاً (افتراضي) ثم الساعات — حسب الأنظمة العالمية للإجازات */
  const [useHours, setUseHours] = useState(false);
  /** قيم محلية لعدد الأيام/الساعات — تحديث عند كل ضغطة فقط لكتابة سلسة على الجوال */
  const [localDaysCount, setLocalDaysCount] = useState('2');
  const [localHoursCount, setLocalHoursCount] = useState('2');
  /** مدة الساعات: من 1 إلى 4 ساعات كحد أقصى. كل 7 ساعات = يوم من الرصيد */
  const [form, setForm] = useState({
    employeeId: '',
    leaveTypeId: '',
    startDate: '',
    startTime: '',
    hoursCount: '2',
    daysCount: '2',
    reason: '',
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        const p = JSON.parse(u)?.permissions ?? [];
        setCanApprove(p.includes('ADMIN') || p.includes('LEAVES_APPROVE'));
      } catch {
        setCanApprove(false);
      }
    }
  }, []);

  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [selectedEmployeeLabel, setSelectedEmployeeLabel] = useState('');

  const { data: employeesRes, isLoading: employeesLoading } = useQuery({
    queryKey: ['employees-for-leaves', employeeSearchTerm],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('limit', employeeSearchTerm ? '500' : '5000');
      params.set('includeInactive', 'true');
      if (employeeSearchTerm) params.set('search', employeeSearchTerm);
      return apiGet<{ data: { id: string; fullName: string; leaveBalance: string | number; department: { name: string } }[] }>(
        `/api/employees?${params}`
      );
    },
    enabled: addOpen,
  });

  const highlightId = searchParams.get('highlight');

  useEffect(() => {
    if (highlightId) {
      setDetailsId(highlightId);
      setDetailsOpen(true);
    }
  }, [highlightId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!addOpen) {
      setEmployeeSearchTerm('');
      setSelectedEmployeeLabel('');
    }
  }, [addOpen]);

  useEffect(() => {
    if (addOpen) {
      setLocalDaysCount(form.daysCount);
      setLocalHoursCount(form.hoursCount);
    }
  }, [addOpen, form.daysCount, form.hoursCount]);

  const { data: leaveDetails } = useQuery({
    queryKey: ['leave-request', detailsId],
    queryFn: () => apiGet<LeaveRequest & { approvedBy?: string; approvedAt?: string }>(`/api/leave-requests/${detailsId}`),
    enabled: !!detailsId,
  });

  const { data: leaveTypes } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => apiGet<{ id: string; nameAr: string; deductFromBalance?: boolean }[]>('/api/leave-types'),
  });

  type BalanceInfo = {
    totalBalanceCumulative: number;
    accrualPerMonth: number;
    accrualPerDay?: number;
    daysPerOneDayAccrual?: number;
    balanceStartDate: string | null;
    baseBalance: number;
    leaveDaysInCurrentMonth: number;
  };
  const { data: balanceInfo } = useQuery({
    queryKey: ['leave-balance-info', form.employeeId, form.leaveTypeId, form.startDate],
    queryFn: () => {
      const params = new URLSearchParams({ employeeId: form.employeeId });
      if (form.leaveTypeId) params.set('leaveTypeId', form.leaveTypeId);
      if (form.startDate) params.set('asOfDate', form.startDate);
      return apiGet<BalanceInfo>(`/api/leave-requests/balance-info?${params}`);
    },
    enabled: !!form.employeeId && addOpen,
  });
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/departments'),
  });
  const { data: stats } = useQuery({
    queryKey: ['leave-requests-stats'],
    queryFn: () => apiGet<StatsResponse>('/api/leave-requests/stats'),
  });

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(pageSize));
  if (debouncedSearch) queryParams.set('search', debouncedSearch);
  if (statusFilter) queryParams.set('status', statusFilter);
  if (departmentFilter) queryParams.set('departmentId', departmentFilter);
  if (leaveTypeFilter) queryParams.set('leaveTypeId', leaveTypeFilter);
  if (fromDate) queryParams.set('fromDate', fromDate);
  if (toDate) queryParams.set('toDate', toDate);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['leave-requests', page, pageSize, debouncedSearch, statusFilter, departmentFilter, leaveTypeFilter, fromDate, toDate],
    queryFn: () => apiGet<LeaveRequestsRes>(`/api/leave-requests?${queryParams}`),
    staleTime: 45 * 1000,
  });

  const { data: chartData } = useQuery({
    queryKey: ['leave-requests-chart'],
    queryFn: () =>
      apiGet<{
        byStatus: Record<string, number>;
        byLeaveType: { leaveTypeId: string; nameAr: string; count: number }[];
        byMonth: { month: number; year: number; count: number }[];
      }>('/api/leave-requests/chart-data'),
  });

  const hasActiveFilters = !!(statusFilter || departmentFilter || leaveTypeFilter || fromDate || toDate || debouncedSearch);

  const [exporting, setExporting] = useState(false);
  const handleExportLeavesCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('limit', '100');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (departmentFilter) params.set('departmentId', departmentFilter);
      if (leaveTypeFilter) params.set('leaveTypeId', leaveTypeFilter);
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      const res = await apiGet<LeaveRequestsRes>(`/api/leave-requests?${params}`);
      const list = res?.data ?? [];
      const headers = ['الموظف', 'القسم', 'نوع الإجازة', 'من', 'إلى', 'الأيام', 'الحالة'];
      const rows = list.map((r) => [
        r.employee?.fullName ?? '',
        r.employee?.department?.name ?? '',
        r.leaveType?.nameAr ?? '',
        new Date(r.startDate).toLocaleDateString('ar-EG'),
        new Date(r.endDate).toLocaleDateString('ar-EG'),
        String(r.daysCount),
        statusLabel[r.status] ?? r.status,
      ]);
      downloadCSV(headers, rows, `طلبات-إجازات-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`تم تصدير ${list.length} سجل`);
    } catch {
      toast.error('فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  const addMutation = useMutation({
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
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests-stats'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests-chart'] });
      setAddOpen(false);
      setForm({
        employeeId: '',
        leaveTypeId: '',
        startDate: '',
        startTime: '',
        hoursCount: '2',
        daysCount: '2',
        reason: '',
      });
      toast.success('تم إرسال طلب الإجازة بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/api/leave-requests/${id}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests-stats'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests-chart'] });
      setApproveOpen(false);
      setSelectedRequest(null);
      toast.success('تم اعتماد طلب الإجازة');
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/api/leave-requests/${id}/reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests-stats'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests-chart'] });
      setRejectOpen(false);
      setSelectedRequest(null);
      toast.success('تم رفض طلب الإجازة');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/leave-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests-stats'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests-chart'] });
      setDeleteOpen(false);
      setSelectedRequest(null);
      setDetailsOpen(false);
      setDetailsId(null);
      toast.success('تم حذف طلب الإجازة');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const requests = data?.data ?? [];
  const total = data?.total ?? 0;
  const statsData = stats ?? { total: 0, pending: 0, approved: 0, rejected: 0 };

  const employeeOptions = (employeesRes?.data ?? []).map((e) => ({
    value: e.id,
    label: e.fullName,
    sub: e.department?.name,
  }));
  const employeesMapRef = useRef<Record<string, { leaveBalance: number }>>({});
  if (employeesRes?.data) {
    for (const e of employeesRes.data) {
      employeesMapRef.current[e.id] = { leaveBalance: Number(e.leaveBalance) || 0 };
    }
  }
  const employeesMap = employeesMapRef.current;
  const leaveTypeOptions = (Array.isArray(leaveTypes) ? leaveTypes : []).map((lt) => ({
    value: lt.id,
    label: lt.nameAr,
    deductFromBalance: lt.deductFromBalance !== false,
  }));
  const deptOptions = (Array.isArray(departments) ? departments : []).map((d) => ({
    value: d.id,
    label: d.name,
  }));

  const calcEndAndReturn = (start: string, hours: number) => {
    if (!start) return { endDate: '', returnDate: '' };
    const days = Math.ceil(hours / HOURS_PER_DAY) || 1;
    const s = new Date(start);
    const end = new Date(s);
    end.setDate(end.getDate() + days - 1);
    const ret = new Date(end);
    ret.setDate(ret.getDate() + 1);
    return {
      endDate: end.toISOString().slice(0, 10),
      returnDate: ret.toLocaleDateString('ar-EG', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),
    };
  };

  /** عند اختيار الساعات: من 1 إلى 4 ساعات فقط. كل 7 ساعات = يوم من الرصيد */
  const HOURS_MIN = 1;
  const HOURS_MAX = 4;
  const selectedLeaveType = leaveTypeOptions.find((lt) => lt.value === form.leaveTypeId);
  const isTemporalLeave = selectedLeaveType?.label?.includes('زمنية') ?? false;
  const effectiveUseHours = useHours || isTemporalLeave;
  const rawRequiredHours = effectiveUseHours
    ? Math.min(HOURS_MAX, Math.max(HOURS_MIN, Number(localHoursCount) || 0))
    : (Number(localDaysCount) || 0) * HOURS_PER_DAY;
  const requiredHours = rawRequiredHours;
  const requiredDays = Math.ceil(requiredHours / HOURS_PER_DAY) || 0;
  const derived = form.startDate ? calcEndAndReturn(form.startDate, requiredHours) : { endDate: '', returnDate: '' };

  const selectedEmpBalance = form.employeeId
    ? (balanceInfo?.totalBalanceCumulative ?? employeesMap[form.employeeId]?.leaveBalance ?? 0)
    : 0;
  const deductsBalance = selectedLeaveType?.deductFromBalance ?? true;
  const balanceExceeded = deductsBalance && requiredHours > 0 && selectedEmpBalance < requiredDays;

  function getReturnTime(startTimeStr: string, hours: number): string {
    if (!startTimeStr || !/^\d{1,2}:\d{2}/.test(startTimeStr)) return '—';
    const [h, m] = startTimeStr.split(':').map(Number);
    const totalMins = (h || 0) * 60 + (m || 0) + hours * 60;
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  /** خيارات الساعات: من 1 إلى 4 ساعات كحد أقصى (كل 7 ساعات = يوم) */
  const HOUR_OPTIONS = [
    { label: 'ساعة', hours: 1 },
    { label: 'ساعتان', hours: 2 },
    { label: '٣ ساعات', hours: 3 },
    { label: '٤ ساعات', hours: 4 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">الإجازات</h1>
          <p className="text-gray-500 mt-1 text-sm">طلبات الإجازات والاعتماد — الإجازة الزمنية (بالساعات) تستخدم نفس الرصيد التراكمي، كل ٧ ساعات = يوم • حد الساعات: ١–٤</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportLeavesCSV}
            disabled={exporting || (data?.total ?? 0) === 0}
            className="gap-2 rounded-xl border-gray-200 hover:bg-gray-50"
          >
            <FileDown className="h-4 w-4" />
            {exporting ? 'جاري التصدير...' : 'تصدير CSV'}
          </Button>
          <Link href="/dashboard/leaves/official-report">
            <Button variant="outline" className="gap-2 rounded-xl border-gray-200 hover:bg-gray-50">
              <FileText className="h-4 w-4" />
              تقرير الإجازات الرسمي
            </Button>
          </Link>
          <Link href="/dashboard/leaves/calendar">
            <Button variant="outline" className="gap-2 rounded-xl border-gray-200 hover:bg-gray-50">
              <CalendarDays className="h-4 w-4" />
              التقويم
            </Button>
          </Link>
          <Button onClick={() => setAddOpen(true)} className="gap-2 shadow-md rounded-xl bg-primary-600 hover:bg-primary-700">
            <Plus className="h-5 w-5" />
            طلب إجازة
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPI_CARDS.map((card, i) => {
          const Icon = card.icon;
          const value = statsData[card.key as keyof StatsResponse] ?? 0;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -2 }}
              className="h-full"
            >
              <Card className="border border-gray-100/80 shadow-sm overflow-hidden rounded-2xl bg-white h-full hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
                    </div>
                    <div className={`rounded-xl p-2.5 shrink-0 ${card.iconBg}`}>
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Charts */}
      {chartData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border border-gray-100/80 shadow-sm overflow-hidden rounded-2xl bg-white">
            <CardContent className="p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-1">توزيع الطلبات حسب الحالة</h3>
              <p className="text-sm text-gray-500 mb-4">معتمدة، قيد الانتظار، مرفوضة</p>
              {Object.values(chartData.byStatus ?? {}).some((v) => v > 0) ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        formatter={(value: number, name: string) => [`${value} طلب`, name]}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                      />
                      <Legend
                        layout="horizontal"
                        align="center"
                        verticalAlign="bottom"
                        formatter={(value) => <span className="text-sm text-gray-700">{value}</span>}
                      />
                      <Pie
                        data={[
                          { name: 'معتمدة', value: chartData.byStatus?.APPROVED ?? 0, color: CHART_COLORS[1] },
                          { name: 'قيد الانتظار', value: chartData.byStatus?.PENDING ?? 0, color: CHART_COLORS[3] },
                          { name: 'مرفوضة', value: chartData.byStatus?.REJECTED ?? 0, color: CHART_COLORS[2] },
                        ].filter((d) => d.value > 0)}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value, percent }) =>
                          value > 0 ? `${name}: ${value} (${(percent * 100).toFixed(0)}%)` : ''
                        }
                        labelLine={{ strokeWidth: 1.5 }}
                      >
                        {[
                          { name: 'معتمدة', value: chartData.byStatus?.APPROVED ?? 0, color: CHART_COLORS[1] },
                          { name: 'قيد الانتظار', value: chartData.byStatus?.PENDING ?? 0, color: CHART_COLORS[3] },
                          { name: 'مرفوضة', value: chartData.byStatus?.REJECTED ?? 0, color: CHART_COLORS[2] },
                        ]
                          .filter((d) => d.value > 0)
                          .map((entry, i) => (
                            <Cell key={i} fill={entry.color} stroke="rgba(255,255,255,0.9)" strokeWidth={2} />
                          ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex items-center justify-center text-gray-400 text-sm">لا توجد طلبات لعرض التوزيع</div>
              )}
            </CardContent>
          </Card>
          <Card className="border border-gray-100/80 shadow-sm overflow-hidden rounded-2xl bg-white">
            <CardContent className="p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-1">الإجازات حسب الشهر</h3>
              <p className="text-sm text-gray-500 mb-4">آخر ٦ أشهر</p>
              {(chartData.byMonth?.length ?? 0) > 0 ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        [...(chartData.byMonth ?? [])]
                          .reverse()
                          .map((m) => ({
                            name: formatMonthLabel(m.month, m.year),
                            شهر: formatMonthLabel(m.month, m.year),
                            طلبات: m.count,
                          }))
                      }
                      layout="vertical"
                      margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={true} vertical={false} />
                      <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="شهر" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => [`${value} طلب`, 'عدد الطلبات']}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                        labelFormatter={(label) => label}
                      />
                      <Bar dataKey="طلبات" name="طلبات" fill={CHART_COLORS[0]} radius={[0, 6, 6, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex items-center justify-center text-gray-400 text-sm">لا توجد بيانات للأشهر الأخيرة</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search & Filters Bar */}
      <Card className="border border-gray-100/80 shadow-sm overflow-hidden rounded-2xl bg-white">
        <div className="border-b border-gray-100 bg-gray-50/60 p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالاسم، القسم، أو نوع الإجازة..."
                  className="pr-10 rounded-xl border-gray-200 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setFiltersExpanded((f) => !f)}
                className="gap-2 shrink-0 rounded-xl border-gray-200"
              >
                <Filter className="h-4 w-4" />
                الفلاتر {hasActiveFilters && <span className="bg-primary-100 text-primary-700 text-xs font-medium px-1.5 py-0.5 rounded-full">{[statusFilter, departmentFilter, leaveTypeFilter, fromDate, toDate].filter(Boolean).length}</span>}
              </Button>
              <div className="flex gap-2 shrink-0 items-center">
                <label className="text-sm text-gray-600 whitespace-nowrap">عرض:</label>
                <Select
                  value={String(pageSize)}
                  onChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                  options={[
                    { value: '10', label: '10' },
                    { value: '25', label: '25' },
                    { value: '50', label: '50' },
                  ]}
                />
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 hover:text-gray-900"
                    onClick={() => {
                      setStatusFilter('');
                      setDepartmentFilter('');
                      setLeaveTypeFilter('');
                      setFromDate('');
                      setToDate('');
                      setSearchQuery('');
                      setPage(1);
                    }}
                  >
                    مسح الكل
                  </Button>
                )}
              </div>
            </div>
            {filtersExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="flex flex-wrap gap-4 p-4 rounded-xl bg-white border border-gray-100"
              >
                <div className="min-w-[140px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">الحالة</label>
                  <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: '', label: 'الكل' },
                      { value: 'PENDING', label: 'قيد الانتظار' },
                      { value: 'APPROVED', label: 'معتمدة' },
                      { value: 'REJECTED', label: 'مرفوضة' },
                    ]}
                  />
                </div>
                <div className="min-w-[140px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">القسم</label>
                  <Select value={departmentFilter} onChange={setDepartmentFilter} options={[{ value: '', label: 'الكل' }, ...deptOptions]} />
                </div>
                <div className="min-w-[140px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">نوع الإجازة</label>
                  <Select value={leaveTypeFilter} onChange={setLeaveTypeFilter} options={[{ value: '', label: 'الكل' }, ...leaveTypeOptions]} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">من تاريخ</label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">إلى تاريخ</label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg" />
                </div>
              </motion.div>
            )}
          </div>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={8} />
          ) : error ? (
            <ErrorState message="حدث خطأ في تحميل البيانات" onRetry={() => refetch()} />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="لا توجد طلبات إجازات"
              description="أضف طلب إجازة جديد أو غيّر الفلاتر لعرض طلبات أخرى"
              actionLabel="طلب إجازة"
              actionIcon={Plus}
              onAction={() => setAddOpen(true)}
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {requests.map((req, i) => (
                <motion.div
                  key={req.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.03, 0.15) }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 hover:bg-gray-50/70 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{req.employee.fullName}</p>
                    <p className="text-sm text-gray-500">
                      {req.employee.department?.name} • {req.leaveType.nameAr}
                    </p>
                    <p className="text-sm text-gray-600 mt-1 flex items-center gap-1 flex-wrap">
                      <CalendarCheck className="h-4 w-4 shrink-0" />
                      {new Date(req.startDate).toLocaleDateString('ar-EG')} —{' '}
                      {new Date(req.endDate).toLocaleDateString('ar-EG')}
                      <span className="text-gray-500">({formatDuration(req.daysCount, req.hoursCount)})</span>
                    </p>
                    {req.reason && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{req.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 min-h-[44px]"
                      onClick={() => {
                        setDetailsId(req.id);
                        setDetailsOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4" /> التفاصيل
                    </Button>
                    {req.status === 'PENDING' && canApprove && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-green-600 border-green-600 hover:bg-green-50 min-h-[44px]"
                          onClick={() => {
                            setSelectedRequest(req);
                            setApproveOpen(true);
                          }}
                          disabled={approveMutation.isPending}
                        >
                          <Check className="h-4 w-4" /> اعتماد
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-red-600 border-red-600 hover:bg-red-50 min-h-[44px]"
                          onClick={() => {
                            setSelectedRequest(req);
                            setRejectOpen(true);
                          }}
                          disabled={rejectMutation.isPending}
                        >
                          <X className="h-4 w-4" /> رفض
                        </Button>
                      </>
                    )}
                    {canApprove && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-red-600 border-red-200 hover:bg-red-50 min-h-[44px]"
                        onClick={() => {
                          setSelectedRequest(req);
                          setDeleteOpen(true);
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" /> حذف
                      </Button>
                    )}
                    <Badge variant={statusVariant[req.status] || 'default'}>{statusLabel[req.status] || req.status}</Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>

        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 bg-gray-50/60">
            <p className="text-sm text-gray-500 tabular-nums">عرض {requests.length} من {total}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="gap-1 rounded-lg">
                <ChevronRight className="h-4 w-4" /> السابق
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * pageSize >= total}
                className="gap-1 rounded-lg"
              >
                التالي <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Details Modal */}
      <Modal
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsId(null);
        }}
        title="تفاصيل طلب الإجازة"
        className="max-w-lg"
      >
        {leaveDetails ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">الموظف</p>
                <p className="font-semibold text-gray-900">{leaveDetails.employee?.fullName}</p>
                <p className="text-sm text-gray-500">{leaveDetails.employee?.department?.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">نوع الإجازة</p>
                <p className="font-medium text-gray-800">{leaveDetails.leaveType?.nameAr}</p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-xs font-medium text-gray-500 mb-2">الفترة والمدة</p>
              <p className="text-gray-800">
                {new Date(leaveDetails.startDate).toLocaleDateString('ar-EG')} —{' '}
                {new Date(leaveDetails.endDate).toLocaleDateString('ar-EG')}
              </p>
              <p className="text-sm text-gray-600 mt-1">{formatDuration(leaveDetails.daysCount, leaveDetails.hoursCount)}</p>
            </div>
            {leaveDetails.reason && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">السبب</p>
                <p className="text-gray-700">{leaveDetails.reason}</p>
              </div>
            )}
            <div className="flex items-center gap-3 pt-2">
              <Badge variant={statusVariant[leaveDetails.status] || 'default'}>
                {statusLabel[leaveDetails.status] || leaveDetails.status}
              </Badge>
              {leaveDetails.approvedAt && (
                <p className="text-sm text-gray-500">
                  {leaveDetails.status === 'APPROVED' ? 'اعتمد في' : 'رفض في'}{' '}
                  {new Date(leaveDetails.approvedAt).toLocaleDateString('ar-EG')}
                </p>
              )}
            </div>
            {leaveDetails.status === 'PENDING' && canApprove && (
              <div className="flex gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  className="gap-1 text-green-600 border-green-600 hover:bg-green-50"
                  variant="outline"
                  onClick={() => {
                    setSelectedRequest(leaveDetails as LeaveRequest);
                    setDetailsOpen(false);
                    setDetailsId(null);
                    setApproveOpen(true);
                  }}
                >
                  <Check className="h-4 w-4" /> اعتماد
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-red-600 border-red-600 hover:bg-red-50"
                  onClick={() => {
                    setSelectedRequest(leaveDetails as LeaveRequest);
                    setDetailsOpen(false);
                    setDetailsId(null);
                    setRejectOpen(true);
                  }}
                >
                  <X className="h-4 w-4" /> رفض
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">جاري التحميل...</div>
        )}
      </Modal>

      {/* Add Modal - تصميم وفق معايير طلبات الإجازات */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="طلب إجازة جديدة" className="max-w-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const temporal = isTemporalLeave;
            const hoursVal = useHours || temporal ? Math.min(HOURS_MAX, Math.max(HOURS_MIN, Number(localHoursCount) || 1)) : undefined;
            const daysVal = !useHours && !temporal ? (Number(localDaysCount) || 0) : undefined;
            addMutation.mutate({
              employeeId: form.employeeId,
              leaveTypeId: form.leaveTypeId,
              startDate: form.startDate,
              startTime: temporal && form.startTime ? form.startTime : undefined,
              hoursCount: hoursVal,
              daysCount: daysVal,
              reason: form.reason || undefined,
            });
          }}
          className="space-y-6"
        >
          <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary-600" />
              معلومات الطلب
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">الموظف</label>
                <SearchableSelect
                  value={form.employeeId}
                  onChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
                  onSelectLabel={setSelectedEmployeeLabel}
                  options={employeeOptions}
                  placeholder="الموظف"
                  searchPlaceholder="بحث..."
                  loadOptions={setEmployeeSearchTerm}
                  isLoading={employeesLoading}
                  selectedLabel={selectedEmployeeLabel || employeeOptions.find((o) => o.value === form.employeeId)?.label}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">نوع الإجازة</label>
                <SearchableSelect
                  value={form.leaveTypeId}
                  onChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v }))}
                  options={leaveTypeOptions}
                  placeholder="نوع الإجازة"
                  searchPlaceholder="بحث..."
                />
              </div>
            </div>
            {form.employeeId && (
              <div className="flex gap-4 p-4 rounded-xl bg-gradient-to-l from-primary-50/60 to-transparent border border-primary-100/60">
                <div className="flex-1 text-center">
                  <p className="text-2xl font-bold text-primary-700">{Number(selectedEmpBalance).toFixed(1)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">رصيد (أيام)</p>
                </div>
                {balanceInfo != null && (
                  <div className="flex-1 text-center border-r border-primary-100">
                    <p className="text-2xl font-bold text-slate-700">{balanceInfo.leaveDaysInCurrentMonth}</p>
                    <p className="text-xs text-gray-500 mt-0.5">مستحق هذا الشهر</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-600" />
              {isTemporalLeave ? 'الإجازة الزمنية — المباشرة نفس اليوم' : 'مدة الإجازة — أيام أو ساعات'}
            </h3>
            {isTemporalLeave ? (
              <>
                <p className="text-xs text-gray-500">
                  حدد تاريخ ووقت بداية الإجازة والمدة (١–٤ ساعات). المباشرة تكون <strong>نفس اليوم</strong> بعد انتهاء الساعات.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">التاريخ</label>
                    <Input
                      type="date"
                      inputMode="none"
                      autoComplete="off"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value || '' }))}
                      required
                      className="rounded-xl min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">ساعة البداية</label>
                    <Input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value || '' }))}
                      required={isTemporalLeave}
                      className="rounded-xl min-h-[44px]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">المدة (ساعات)</label>
                    <div className="flex gap-2 flex-wrap">
                      {HOUR_OPTIONS.map((p) => (
                        <Button
                          key={p.hours}
                          type="button"
                          variant={Number(localHoursCount) === p.hours ? 'default' : 'outline'}
                          size="sm"
                          className="rounded-lg min-h-[44px]"
                          onClick={() => {
                            const s = String(p.hours);
                            setLocalHoursCount(s);
                            setForm((f) => ({ ...f, hoursCount: s }));
                          }}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                {form.startTime && (
                  <p className="text-sm text-primary-700 font-medium">
                    المباشرة: نفس اليوم الساعة {getReturnTime(form.startTime, Number(localHoursCount) || 0)}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  الإجازة الزمنية (بالساعات) تستخدم <strong>نفس الرصيد التراكمي</strong>. كل ٧ ساعات = يوم. عند اختيار الساعات: من ١ إلى ٤.
                </p>
                <div className="flex gap-2 p-2 rounded-xl bg-slate-50/80">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 justify-center py-2.5 rounded-lg transition-all border-2 border-transparent has-[:checked]:border-primary-500 has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:text-primary-700 min-h-[44px]">
                    <input type="radio" checked={!useHours} onChange={() => setUseHours(false)} className="sr-only" />
                    <CalendarDays className="h-4 w-4" />
                    <span className="text-sm font-medium">أيام</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer flex-1 justify-center py-2.5 rounded-lg transition-all border-2 border-transparent has-[:checked]:border-primary-500 has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:checked]:text-primary-700 min-h-[44px]">
                    <input
                      type="radio"
                      checked={useHours}
                      onChange={() => {
                        setUseHours(true);
                        const n = Math.min(HOURS_MAX, Math.max(HOURS_MIN, Number(localHoursCount) || 1));
                        setLocalHoursCount(String(n));
                        setForm((f) => ({ ...f, hoursCount: String(n) }));
                      }}
                      className="sr-only"
                    />
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-medium">ساعات (١–٤)</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {!useHours ? (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">عدد الأيام</label>
                      <Input
                        inputMode="numeric"
                        type="text"
                        value={localDaysCount}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '');
                          setLocalDaysCount(v);
                        }}
                        onBlur={(e) => {
                          const v = e.target.value.replace(/\D/g, '');
                          setForm((f) => ({ ...f, daysCount: v }));
                        }}
                        placeholder="2"
                        required
                        className="rounded-xl min-h-[44px]"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">المدة (حد أقصى ٤ ساعات)</label>
                      <div className="flex gap-2 flex-wrap">
                        {HOUR_OPTIONS.map((p) => (
                          <Button
                            key={p.hours}
                            type="button"
                            variant={Number(localHoursCount) === p.hours ? 'default' : 'outline'}
                            size="sm"
                            className="rounded-lg min-h-[44px]"
                            onClick={() => {
                              const s = String(p.hours);
                              setLocalHoursCount(s);
                              setForm((f) => ({ ...f, hoursCount: s }));
                            }}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </div>
                      <Input
                        inputMode="numeric"
                        type="text"
                        value={localHoursCount}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '');
                          const num = parseInt(v, 10);
                          if (v === '' || (num >= 1 && num <= 4)) setLocalHoursCount(v || '');
                          else if (num > 4) setLocalHoursCount('4');
                        }}
                        onBlur={(e) => {
                          const v = e.target.value.replace(/\D/g, '');
                          const num = Math.min(HOURS_MAX, Math.max(HOURS_MIN, parseInt(v, 10) || 1));
                          const s = String(num);
                          setLocalHoursCount(s);
                          setForm((f) => ({ ...f, hoursCount: s }));
                        }}
                        placeholder="1–4"
                        required
                        className="rounded-xl mt-2 min-h-[44px]"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">تاريخ البداية</label>
                    <Input
                      type="date"
                      inputMode="none"
                      autoComplete="off"
                      value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value || '' }))}
                      required
                      className="rounded-xl min-h-[44px]"
                    />
                  </div>
                </div>
                {form.startDate && (Number(localHoursCount) > 0 || Number(localDaysCount) > 0) && derived.endDate && (
                  <div className="flex flex-wrap gap-4 py-3 px-3 rounded-xl bg-slate-50 text-sm text-gray-600">
                    <span><strong className="text-gray-800">تاريخ النهاية:</strong> {new Date(derived.endDate).toLocaleDateString('ar-EG')}</span>
                    <span><strong className="text-gray-800">العودة:</strong> {derived.returnDate}</span>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 space-y-4">
            <label className="block text-xs font-medium text-gray-500">السبب (اختياري)</label>
            <Input
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="السبب"
              className="rounded-xl min-h-[44px]"
            />
          </section>

          {balanceExceeded && (
            <div className="flex items-center gap-2 py-3 px-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>رصيد غير كافٍ</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)} className="rounded-xl flex-1 sm:flex-none">
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={addMutation.isPending || balanceExceeded || !form.leaveTypeId || (isTemporalLeave && !form.startTime)}
              className="rounded-xl flex-1 sm:flex-none"
            >
              {addMutation.isPending ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="اعتماد طلب الإجازة"
        description={selectedRequest ? `هل أنت متأكد من اعتماد إجازة ${selectedRequest.employee.fullName}؟` : undefined}
        confirmLabel="اعتماد"
        onConfirm={async () => {
          if (selectedRequest) await approveMutation.mutateAsync(selectedRequest.id);
        }}
      />
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="رفض طلب الإجازة"
        description={selectedRequest ? `هل أنت متأكد من رفض إجازة ${selectedRequest.employee.fullName}؟` : undefined}
        confirmLabel="رفض"
        variant="danger"
        onConfirm={async () => {
          if (selectedRequest) await rejectMutation.mutateAsync(selectedRequest.id);
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف طلب الإجازة"
        description={
          selectedRequest
            ? `هل أنت متأكد من حذف إجازة ${selectedRequest.employee.fullName} (${new Date(selectedRequest.startDate).toLocaleDateString('ar-EG')} - ${new Date(selectedRequest.endDate).toLocaleDateString('ar-EG')})؟ لا يمكن التراجع.`
            : undefined
        }
        confirmLabel="حذف"
        variant="danger"
        onConfirm={async () => {
          if (selectedRequest) await deleteMutation.mutateAsync(selectedRequest.id);
        }}
      />
    </motion.div>
  );
}
