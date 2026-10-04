'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileDown,
  FileSpreadsheet,
  Fingerprint,
  Link2,
  Printer,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api';
import { fetchLiveDayRange } from '@/lib/live-day-range';
import { downloadAttendancePdf, rosterMatchesStatus, type AttendancePdfLayout, type AttendanceStatusFilter } from '@/lib/attendance-pdf';
import { downloadAttendanceExcel } from '@/lib/attendance-excel';
import { printAttendanceSheet } from '@/lib/attendance-print';
import { hospitalDateKey, hospitalDateTime } from '@/lib/hospital-clock';
import {
  daysBetween,
  enumerateDays,
  exceptionCount,
  groupExceptions,
  isoDate,
  matchesQuery,
  needsSchedule,
  shiftDate,
  sortRows,
  summarizeByDay,
  summarizeByEmployee,
  summarizeRows,
  type PunchLogRow,
  type RosterRow,
  type RowSortKey,
  type SortDir,
} from '@/lib/attendance-stats';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Modal } from '@/components/ui/modal';
import { useDebounce } from '@/hooks/use-debounce';
import { KpiStrip } from './_components/kpi-strip';
import { SheetTable, ColumnPicker, DEFAULT_COLUMNS, type ColumnKey } from './_components/sheet-table';
import { SummaryTable } from './_components/summary-table';
import { EmployeeModal } from './_components/employee-modal';
import { DeviceStatus } from './_components/device-status';
import { DayStrip } from './_components/day-strip';
import { OpsStrip } from './_components/ops-strip';
import { ExceptionsBoard } from './_components/exceptions-board';
import { PunchLog } from './_components/punch-log';

type Inbox = {
  boundDevices: { id: string; name: string; serial: string; fingerprintCount: number }[];
  unboundSerials: { serial: string; lastSeenAt: string; requestCount: number }[];
  linkableDevices: { id: string; name: string; serial: string | null; fingerprintCount: number; bound: boolean }[];
};

type LiveDay = {
  deviceId: string;
  deviceName: string;
  serial: string;
  deviceDepartment: { id: string; name: string; employeeCount: number; locked?: boolean } | null;
  date: string;
  fromDate: string;
  toDate: string;
  counts: {
    employees: number;
    rows?: number;
    present: number;
    late: number;
    overtime: number;
    absent: number;
    leave: number;
    rest: number;
    holiday: number;
    unmatchedPins: number;
  };
  unmatchedPins: string[];
  unmatchedDetails?: { fingerprintId: string; lastSeenAt: string; punchCount: number }[];
  roster: RosterRow[];
  punches: PunchLogRow[];
};

type EmployeeHit = {
  id: string;
  fullName: string;
  jobTitle: string;
  department?: { id: string; name: string };
};

type StatusFilter = AttendanceStatusFilter;
type Panel = 'sheet' | 'exceptions' | 'summary' | 'unmatched' | 'live' | 'log';
const PANELS: Panel[] = ['sheet', 'exceptions', 'summary', 'unmatched', 'live', 'log'];

function isPanel(value: string | null): value is Panel {
  return Boolean(value && PANELS.includes(value as Panel));
}

function isStatus(value: string | null): value is StatusFilter {
  return Boolean(
    value &&
      ['all', 'present', 'late', 'early', 'inside', 'absent', 'leave', 'rest', 'overtime', 'single', 'noschedule'].includes(value),
  );
}

function formatDateTime(iso: string) {
  return hospitalDateTime(iso);
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function monthRange(base: Date, offset: number) {
  const start = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth(), lastDayOfMonth(start.getFullYear(), start.getMonth()));
  return { from: isoDate(start), to: isoDate(end) };
}

function saturdayOf(date: Date) {
  const d = new Date(date);
  const diff = (d.getDay() + 1) % 7; // السبت = 0
  d.setDate(d.getDate() - diff);
  return d;
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = hospitalDateKey(new Date().toISOString());
  const [fromDate, setFromDate] = useState(() => searchParams.get('from') || today);
  const [toDate, setToDate] = useState(() => searchParams.get('to') || today);
  const [deviceId, setDeviceId] = useState(() => searchParams.get('device') || '');
  const [bindDeviceId, setBindDeviceId] = useState('');
  const [panel, setPanel] = useState<Panel>(() => (isPanel(searchParams.get('tab')) ? (searchParams.get('tab') as Panel) : 'sheet'));
  const [nameQuery, setNameQuery] = useState(() => searchParams.get('q') || '');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    isStatus(searchParams.get('status')) ? (searchParams.get('status') as StatusFilter) : 'all',
  );
  const [savedRange, setSavedRange] = useState<{ from: string; to: string } | null>(null);
  const [noScheduleOnly, setNoScheduleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<RowSortKey>('none');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [assignPin, setAssignPin] = useState<string | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [moveDept, setMoveDept] = useState(false);
  const debouncedEmpSearch = useDebounce(empSearch, 300);
  const debouncedQuery = useDebounce(nameQuery, 200);
  const seenPunches = useRef<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState<AttendancePdfLayout | null>(null);
  const [pdfLabel, setPdfLabel] = useState('');
  const [unmatchedFrom, setUnmatchedFrom] = useState('');
  const [unmatchedTo, setUnmatchedTo] = useState('');

  // استرجاع التفضيلات المحفوظة (الجهاز، الأعمدة، التحديث التلقائي)
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('att.prefs') ?? '{}') as {
        deviceId?: string;
        columns?: ColumnKey[];
        autoRefresh?: boolean;
      };
      if (!searchParams.get('device') && saved.deviceId) setDeviceId(saved.deviceId);
      if (Array.isArray(saved.columns)) setColumns(saved.columns.filter((c) => DEFAULT_COLUMNS.includes(c)));
      if (typeof saved.autoRefresh === 'boolean') setAutoRefresh(saved.autoRefresh);
    } catch {
      /* تجاهل */
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem('att.prefs', JSON.stringify({ deviceId, columns, autoRefresh }));
  }, [deviceId, columns, autoRefresh]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (deviceId) next.set('device', deviceId);
    if (fromDate) next.set('from', fromDate);
    if (toDate) next.set('to', toDate);
    if (panel !== 'sheet') next.set('tab', panel);
    if (statusFilter !== 'all') next.set('status', statusFilter);
    if (debouncedQuery.trim()) next.set('q', debouncedQuery.trim());
    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    router.replace(href, { scroll: false });
  }, [deviceId, fromDate, toDate, panel, statusFilter, debouncedQuery, pathname, router]);

  // اختصارات: / بحث، 1–6 التبويب، [ ] الفترة، Escape مسح الفلاتر
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (typing) return;
      if (e.key >= '1' && e.key <= '6') setPanel(PANELS[Number(e.key) - 1]);
      if (e.key === 'Escape') {
        setNameQuery('');
        setDepartmentFilter('');
        setUnitFilter('');
        setStatusFilter('all');
        setNoScheduleOnly(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const inboxQuery = useQuery({
    queryKey: ['adms-inbox'],
    queryFn: () => apiGet<Inbox>('/api/devices/adms-inbox'),
  });

  const bound = inboxQuery.data?.boundDevices ?? [];
  const unbound = inboxQuery.data?.unboundSerials ?? [];
  const linkable = inboxQuery.data?.linkableDevices ?? [];

  useEffect(() => {
    if (bound.length && !bound.some((d) => d.id === deviceId)) setDeviceId(bound[0].id);
  }, [bound, deviceId]);

  useEffect(() => {
    if (!bindDeviceId && linkable[0]) setBindDeviceId(linkable[0].id);
  }, [linkable, bindDeviceId]);

  const selected = useMemo(() => bound.find((d) => d.id === deviceId) ?? bound[0] ?? null, [bound, deviceId]);
  const activeId = selected?.id ?? '';

  const dayQuery = useQuery({
    queryKey: ['live-day', activeId, fromDate, toDate],
    enabled: Boolean(activeId),
    refetchInterval: autoRefresh ? 20000 : false,
    placeholderData: (previous) => previous,
    queryFn: () => fetchLiveDayRange<LiveDay>(activeId, fromDate, toDate),
  });

  const empQuery = useQuery({
    queryKey: ['assign-emp-search', dayQuery.data?.deviceDepartment?.id, debouncedEmpSearch, moveDept],
    enabled: Boolean(assignPin && debouncedEmpSearch.trim().length >= 2),
    queryFn: () => {
      const dept = dayQuery.data?.deviceDepartment?.id;
      const q = new URLSearchParams({
        search: debouncedEmpSearch.trim(),
        limit: '12',
        ...(dept && !moveDept ? { departmentId: dept } : {}),
      });
      return apiGet<{ data: EmployeeHit[] }>(`/api/employees?${q.toString()}`);
    },
  });

  const assignMutation = useMutation({
    mutationFn: (payload: { employeeId: string; moveToDepartment: boolean }) =>
      apiPost(`/api/devices/${activeId}/assign-pin`, {
        fingerprintId: assignPin,
        employeeId: payload.employeeId,
        moveToDepartment: payload.moveToDepartment,
      }),
    onSuccess: () => {
      toast.success('تم ربط المعرف بالموظف');
      setAssignPin(null);
      setEmpSearch('');
      setMoveDept(false);
      queryClient.invalidateQueries({ queryKey: ['live-day'] });
      queryClient.invalidateQueries({ queryKey: ['unmatched-pins'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deptMutation = useMutation({
    mutationFn: (departmentId: string) =>
      apiPost(`/api/devices/${activeId}/department`, { departmentId }),
    onSuccess: () => {
      toast.success('تم تثبيت قسم الجهاز');
      queryClient.invalidateQueries({ queryKey: ['live-day'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: departmentOptions } = useQuery({
    queryKey: ['departments-list'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/devices/department-options'),
  });

  const bindMutation = useMutation({
    mutationFn: (payload: { deviceId: string; serial: string }) =>
      apiPost(`/api/devices/${payload.deviceId}/bind-serial`, { serial: payload.serial }),
    onSuccess: () => {
      toast.success('تم ربط الجهاز بالقسم');
      queryClient.invalidateQueries({ queryKey: ['adms-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['live-day'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unmatchedQuery = useQuery({
    queryKey: ['unmatched-pins', activeId, unmatchedFrom, unmatchedTo],
    enabled: Boolean(activeId),
    queryFn: () => {
      const q = new URLSearchParams();
      if (unmatchedFrom) q.set('fromDate', unmatchedFrom);
      if (unmatchedTo) q.set('toDate', unmatchedTo);
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return apiGet<{
        total: number;
        fromDate: string | null;
        toDate: string | null;
        pins: { fingerprintId: string; punchCount: number; firstSeenAt: string; lastSeenAt: string }[];
      }>(`/api/devices/${activeId}/unmatched-pins${suffix}`);
    },
  });

  const day = dayQuery.data;

  useEffect(() => {
    const punches = day?.punches ?? [];
    if (!punches.length) return;
    const nextFresh = new Set<string>();
    for (const p of punches) {
      const key = `${p.fingerprintId}|${p.scannedAt}`;
      if (seenPunches.current.size > 0 && !seenPunches.current.has(key)) nextFresh.add(key);
      seenPunches.current.add(key);
    }
    if (nextFresh.size) setFreshKeys(nextFresh);
  }, [day?.punches]);

  const departmentNames = useMemo(
    () => [...new Set((day?.roster ?? []).map((r) => r.departmentName).filter(Boolean))] as string[],
    [day?.roster],
  );
  const units = useMemo(
    () => [...new Set((day?.roster ?? []).map((r) => r.unitName).filter(Boolean))] as string[],
    [day?.roster],
  );

  /** كل الفلاتر عدا الحالة — تعتمد عليها البطاقات والعدادات والملخص. */
  const baseRoster = useMemo(
    () =>
      (day?.roster ?? []).filter((r) => {
        if (debouncedQuery.trim() && !matchesQuery(r, debouncedQuery)) return false;
        if (departmentFilter && r.departmentName !== departmentFilter) return false;
        if (unitFilter && r.unitName !== unitFilter) return false;
        if (noScheduleOnly && !needsSchedule(r)) return false;
        return true;
      }),
    [day?.roster, debouncedQuery, departmentFilter, unitFilter, noScheduleOnly],
  );
  const filteredRoster = useMemo(
    () => baseRoster.filter((r) => rosterMatchesStatus(r, statusFilter)),
    [baseRoster, statusFilter],
  );
  const sortedRoster = useMemo(() => sortRows(filteredRoster, sortKey, sortDir), [filteredRoster, sortKey, sortDir]);
  const summary = useMemo(() => summarizeRows(baseRoster), [baseRoster]);
  const employeeSummaries = useMemo(() => summarizeByEmployee(baseRoster), [baseRoster]);
  const rangeDays = daysBetween(fromDate, toDate);
  const multiDay = rangeDays > 1;
  const noScheduleCount = useMemo(() => (day?.roster ?? []).filter(needsSchedule).length, [day?.roster]);

  const statusCounts = useMemo(() => {
    const count = (s: StatusFilter) => baseRoster.filter((r) => rosterMatchesStatus(r, s)).length;
    return {
      all: baseRoster.length,
      present: count('present'),
      late: count('late'),
      early: count('early'),
      inside: count('inside'),
      single: count('single'),
      overtime: count('overtime'),
      absent: count('absent'),
      leave: count('leave'),
      rest: count('rest'),
      noschedule: count('noschedule'),
    };
  }, [baseRoster]);
  const exceptionGroups = useMemo(() => groupExceptions(baseRoster), [baseRoster]);
  const followCount = useMemo(() => exceptionCount(baseRoster), [baseRoster]);
  const rangeDaysList = useMemo(() => enumerateDays(fromDate, toDate), [fromDate, toDate]);
  const byDay = useMemo(() => summarizeByDay(baseRoster), [baseRoster]);
  const todayRows = useMemo(() => baseRoster.filter((row) => row.workDate === today), [baseRoster, today]);
  const includesToday = fromDate <= today && toDate >= today;

  const filtersActive = Boolean(nameQuery.trim() || departmentFilter || unitFilter || statusFilter !== 'all' || noScheduleOnly);
  const resetFilters = () => {
    setNameQuery('');
    setDepartmentFilter('');
    setUnitFilter('');
    setStatusFilter('all');
    setNoScheduleOnly(false);
  };
  const resetKey = `${activeId}|${fromDate}|${toDate}|${debouncedQuery}|${departmentFilter}|${unitFilter}|${statusFilter}|${noScheduleOnly}|${sortKey}|${sortDir}`;

  const onSort = (key: RowSortKey) => {
    if (key === sortKey) {
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortKey('none');
        setSortDir('asc');
      }
    } else {
      setSortKey(key);
      setSortDir(key === 'late' || key === 'overtime' || key === 'worked' ? 'desc' : 'asc');
    }
  };

  // ───── التنقل بين الفترات ─────
  const setRange = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
  };
  const base = new Date(`${today}T12:00:00`);
  const quickRanges: Array<{ label: string; from: string; to: string }> = [
    { label: 'اليوم', from: today, to: today },
    { label: 'أمس', from: shiftDate(today, -1), to: shiftDate(today, -1) },
    { label: 'آخر 7 أيام', from: shiftDate(today, -6), to: today },
    { label: 'هذا الأسبوع', from: isoDate(saturdayOf(base)), to: today },
    { label: 'آخر 30 يوماً', from: shiftDate(today, -29), to: today },
    { label: 'هذا الشهر', from: monthRange(base, 0).from, to: today },
    { label: 'الشهر السابق', ...monthRange(base, -1) },
    { label: 'هذه السنة', from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
  const monthMode = fromDate.endsWith('-01') && fromDate.slice(0, 7) === toDate.slice(0, 7);
  const goPrev = () => {
    if (monthMode) {
      const d = new Date(`${fromDate}T12:00:00`);
      const r = monthRange(d, -1);
      setRange(r.from, r.to);
    } else {
      const span = rangeDays;
      setRange(shiftDate(fromDate, -span), shiftDate(toDate, -span));
    }
  };
  const goNext = () => {
    if (monthMode) {
      const d = new Date(`${fromDate}T12:00:00`);
      const r = monthRange(d, 1);
      setRange(r.from, r.to > today ? today : r.to);
    } else {
      const span = rangeDays;
      const nextTo = shiftDate(toDate, span);
      setRange(shiftDate(fromDate, span), nextTo > today ? today : nextTo);
    }
  };
  const canNext = toDate < today;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === '[') goPrev();
      if (e.key === ']' && canNext) goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exportCommon = () =>
    day
      ? {
          deviceName: day.deviceName,
          serial: day.serial,
          departmentName: day.deviceDepartment?.name ?? null,
          fromDate: day.fromDate,
          toDate: day.toDate,
        }
      : null;

  const runPdf = (layout: AttendancePdfLayout) => {
    if (!day) return;
    setPdfBusy(layout);
    setPdfLabel('جاري إنشاء الكشف…');
    void downloadAttendancePdf({
      layout,
      deviceName: day.deviceName,
      serial: day.serial,
      departmentName: day.deviceDepartment?.name ?? null,
      departmentLocked: Boolean(day.deviceDepartment?.locked),
      fromDate: day.fromDate,
      toDate: day.toDate,
      filters: {
        name: nameQuery,
        department: departmentFilter,
        unit: unitFilter,
        status: statusFilter,
      },
      rows: sortedRoster,
      onProgress: (page, total) => setPdfLabel(`صفحة ${page} من ${total}`),
    })
      .then(() => toast.success(layout === 'official' ? 'تم تنزيل الكشف الرسمي' : 'تم تنزيل الكشف المفصل'))
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'تعذر إنشاء الكشف');
      })
      .finally(() => {
        setPdfBusy(null);
        setPdfLabel('');
      });
  };

  const viewTabs = [
    { id: 'sheet' as const, label: 'الكشف', count: filteredRoster.length },
    { id: 'exceptions' as const, label: 'المتابعة', count: followCount },
    { id: 'summary' as const, label: 'ملخص الموظفين', count: employeeSummaries.length },
    { id: 'unmatched' as const, label: 'معرفات بلا موظف', count: unmatchedQuery.data?.total ?? 0 },
    { id: 'live' as const, label: 'البث', count: day?.punches.length ?? 0 },
    { id: 'log' as const, label: 'السجل', count: day?.punches.length ?? 0 },
  ];

  const statusChips: Array<{ key: StatusFilter; label: string; value: number; className?: string }> = [
    { key: 'all', label: 'الكل', value: statusCounts.all },
    { key: 'present', label: 'حاضر', value: statusCounts.present, className: 'text-emerald-700' },
    { key: 'inside', label: 'في العمل', value: statusCounts.inside, className: 'text-emerald-700' },
    { key: 'late', label: 'متأخر', value: statusCounts.late, className: 'text-orange-700' },
    { key: 'early', label: 'مبكر', value: statusCounts.early, className: 'text-orange-700' },
    { key: 'single', label: 'بصمة واحدة', value: statusCounts.single, className: 'text-sky-700' },
    { key: 'overtime', label: 'إضافي', value: statusCounts.overtime, className: 'text-emerald-700' },
    { key: 'absent', label: 'غائب', value: statusCounts.absent, className: 'text-red-700' },
    { key: 'leave', label: 'إجازة', value: statusCounts.leave, className: 'text-violet-700' },
    { key: 'rest', label: 'استراحة', value: statusCounts.rest },
    { key: 'noschedule', label: 'بلا جدول', value: statusCounts.noschedule, className: 'text-orange-700' },
  ];

  const copyViewLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('تم نسخ رابط هذا العرض');
    } catch {
      toast.error('تعذر نسخ الرابط');
    }
  };

  const openAssign = (pin: string) => {
    setAssignPin(pin);
    setEmpSearch('');
    setMoveDept(false);
  };

  const dayLoading = dayQuery.isLoading || (dayQuery.isFetching && !day);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الحضور والانصراف</h1>
          <p className="mt-1 text-sm text-gray-600 print:hidden">
            {selected
              ? `${selected.name} · ${selected.fingerprintCount} معرف مسجّل${day ? ` · ${summary.total} سجل` : ''}${followCount ? ` · ${followCount} يحتاج متابعة` : ''}`
              : 'اختر الجهاز ثم الفترة'}
          </p>
          <p className="mt-1 hidden text-[11px] text-gray-400 sm:block">
            اختصارات: / بحث · 1–6 التبويبات · [ ] الفترة السابقة/التالية · Escape مسح الفلاتر
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => void copyViewLink()}
          >
            <Link2 className="h-4 w-4" />
            نسخ الرابط
          </Button>
          <Button
            onClick={() => {
              inboxQuery.refetch();
              dayQuery.refetch();
              unmatchedQuery.refetch();
            }}
            disabled={inboxQuery.isFetching || dayQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${inboxQuery.isFetching || dayQuery.isFetching ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
        </div>
      </div>

      {!!unbound.length && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="font-semibold text-amber-950">أجهزة تحتاج ربطاً بقسم</h2>
              <p className="mt-1 text-sm text-amber-900/80">
                وصل رقم تسلسلي جديد من البوابة. اربطه بجهاز القسم مرة واحدة؛ بعدها كل بصماته تُحسب لهذا القسم فقط.
              </p>
            </div>
            {unbound.map((s) => (
              <div key={s.serial} className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4">
                <div className="min-w-[180px]">
                  <p className="text-xs text-gray-500">الرقم التسلسلي</p>
                  <p className="font-mono text-base font-semibold" dir="ltr">
                    {s.serial}
                  </p>
                </div>
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">جهاز القسم</label>
                  <select
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                    value={bindDeviceId}
                    onChange={(e) => setBindDeviceId(e.target.value)}
                  >
                    {linkable.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.bound ? ` — مربوط (${d.serial})` : ` — ${d.fingerprintCount} معرف`}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  disabled={!bindDeviceId || bindMutation.isPending}
                  onClick={() => bindMutation.mutate({ deviceId: bindDeviceId, serial: s.serial })}
                >
                  ربط بهذا القسم
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!inboxQuery.isLoading && !bound.length && !unbound.length && (
        <EmptyState
          icon={Fingerprint}
          title="لا توجد أجهزة مرسلة من البوابة"
          description="عند وصول جهاز البصمة إلى البوابة سيظهر رقمه التسلسلي هنا لربطه بقسم."
        />
      )}

      {!!bound.length && (
        <>
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap gap-2">
                {bound.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDeviceId(d.id)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      d.id === activeId
                        ? 'bg-primary-700 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
              {selected && (
                <p className="text-sm text-gray-600">
                  مربوط برقم{' '}
                  <span className="font-mono font-semibold" dir="ltr">
                    {selected.serial}
                  </span>
                  {day?.deviceDepartment ? ` — قسم ${day.deviceDepartment.name}${day.deviceDepartment.locked ? '' : ' (غير مثبت)'}` : ''}
                  {' '}— {selected.fingerprintCount} معرف مسجّل
                </p>
              )}

              <div className="space-y-3 border-t border-gray-100 pt-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={goPrev}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      aria-label="الفترة السابقة"
                      title="الفترة السابقة"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={!canNext}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
                      aria-label="الفترة التالية"
                      title="الفترة التالية"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">من تاريخ</label>
                    <input
                      type="date"
                      className="h-10 rounded-xl border border-gray-200 px-3 text-sm"
                      value={fromDate}
                      max={toDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        setFromDate(v);
                        if (v > toDate) setToDate(v);
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">إلى تاريخ</label>
                    <input
                      type="date"
                      className="h-10 rounded-xl border border-gray-200 px-3 text-sm"
                      value={toDate}
                      min={fromDate}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        setToDate(v);
                        if (v < fromDate) setFromDate(v);
                      }}
                    />
                  </div>
                  <span className="mb-2.5 inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {rangeDays} {rangeDays === 1 ? 'يوم' : rangeDays <= 10 ? 'أيام' : 'يوماً'}
                  </span>
                  <div className="min-w-[200px] sm:ms-auto">
                    <label className="mb-1 block text-xs text-gray-500">قسم الجهاز</label>
                    <select
                      className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                      value={day?.deviceDepartment?.locked ? day.deviceDepartment.id : ''}
                      onChange={(e) => {
                        if (e.target.value) deptMutation.mutate(e.target.value);
                      }}
                    >
                      <option value="">اختر القسم الرسمي</option>
                      {(departmentOptions ?? []).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <DayStrip
                  days={rangeDaysList}
                  fromDate={fromDate}
                  toDate={toDate}
                  today={today}
                  byDay={byDay}
                  onPick={(date) => {
                    if (fromDate !== toDate) setSavedRange({ from: fromDate, to: toDate });
                    setRange(date, date);
                  }}
                  onRestore={() => {
                    if (savedRange) setRange(savedRange.from, savedRange.to);
                  }}
                />
                <div className="flex flex-wrap gap-1.5">
                  {quickRanges.map((r) => {
                    const active = r.from === fromDate && r.to === toDate;
                    return (
                      <button
                        key={r.label}
                        type="button"
                        onClick={() => setRange(r.from, r.to)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          active
                            ? 'border-primary-700 bg-primary-700 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {day && (
            <DeviceStatus
              punches={day.punches}
              includesToday={includesToday}
              updatedAt={dayQuery.dataUpdatedAt}
              fetching={dayQuery.isFetching}
              autoRefresh={autoRefresh}
              onToggleAuto={() => setAutoRefresh((v) => !v)}
            />
          )}

          {includesToday && day && !dayLoading && (
            <OpsStrip
              todayRows={todayRows}
              unmatched={unmatchedQuery.data?.total ?? 0}
              onFilter={(status) => {
                setStatusFilter(status);
                setPanel('sheet');
              }}
              onOpenUnmatched={() => setPanel('unmatched')}
            />
          )}

          <div className="flex flex-wrap gap-1 rounded-full bg-gray-100 p-1 sm:w-fit">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPanel(tab.id)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${
                  panel === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
                <span className={`rounded-full px-1.5 text-xs ${panel === tab.id ? 'bg-primary-50 text-primary-800' : 'bg-gray-200 text-gray-600'}`}>
                  {tab.id === 'unmatched' && unmatchedQuery.isLoading ? '…' : tab.count}
                </span>
              </button>
            ))}
          </div>

          {dayQuery.isError && (
            <Card>
              <CardContent className="flex items-center justify-between gap-3 p-5 text-sm text-red-600">
                <span>{(dayQuery.error as Error).message}</span>
                <Button size="sm" variant="outline" onClick={() => dayQuery.refetch()}>إعادة المحاولة</Button>
              </CardContent>
            </Card>
          )}

          {(panel === 'sheet' || panel === 'summary' || panel === 'exceptions') && (
            <>
              {dayLoading ? (
                <Skeleton className="h-36 w-full rounded-2xl" />
              ) : (
                day && baseRoster.length > 0 && <KpiStrip summary={summary} days={rangeDays} />
              )}
            </>
          )}

              {panel === 'unmatched' && (
          <Card id="unmatched-pins">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">المعرفات غير المعرّفة</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    كل البصمات بلا موظف على هذا الجهاز. اضغط تعريف لربط المعرف.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">من تاريخ</label>
                    <input
                      type="date"
                      className="h-10 rounded-md border border-gray-200 px-3 text-sm"
                      value={unmatchedFrom}
                      onChange={(e) => setUnmatchedFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">إلى تاريخ</label>
                    <input
                      type="date"
                      className="h-10 rounded-md border border-gray-200 px-3 text-sm"
                      value={unmatchedTo}
                      onChange={(e) => setUnmatchedTo(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUnmatchedFrom('');
                      setUnmatchedTo('');
                    }}
                  >
                    كل البصمات
                  </Button>
                </div>
              </div>
              {unmatchedQuery.isLoading ? (
                <p className="text-sm text-gray-500">جاري جمع كل المعرفات غير المعرّفة…</p>
              ) : unmatchedQuery.isError ? (
                <p className="text-sm text-red-600">{(unmatchedQuery.error as Error).message}</p>
              ) : !unmatchedQuery.data?.pins.length ? (
                <p className="text-sm text-gray-500">لا توجد معرفات غير معرّفة في هذا النطاق.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-right text-gray-500">
                        <th className="px-3 py-2 font-medium">المعرف</th>
                        <th className="px-3 py-2 font-medium">عدد البصمات</th>
                        <th className="px-3 py-2 font-medium">أول بصمة</th>
                        <th className="px-3 py-2 font-medium">آخر بصمة</th>
                        <th className="px-3 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedQuery.data.pins.map((pin) => (
                        <tr key={pin.fingerprintId} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono font-semibold">{pin.fingerprintId}</td>
                          <td className="px-3 py-2">{pin.punchCount}</td>
                          <td className="px-3 py-2 font-mono text-xs">{formatDateTime(pin.firstSeenAt)}</td>
                          <td className="px-3 py-2 font-mono text-xs">{formatDateTime(pin.lastSeenAt)}</td>
                          <td className="px-3 py-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAssign(pin.fingerprintId)}
                            >
                              تعريف
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-gray-500">{unmatchedQuery.data.total} معرف غير معرّف</p>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {panel === 'exceptions' && (
            dayLoading ? <Skeleton className="h-64 w-full rounded-2xl" /> : (
              <>
              <Card>
                <CardContent className="grid gap-3 p-4 md:grid-cols-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input className="pr-10" placeholder="بحث بالاسم أو المعرف أو الوظيفة" value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} />
                  </div>
                  <select className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                    <option value="">كل الأقسام</option>
                    {departmentNames.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
                    <option value="">كل الوحدات</option>
                    {units.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </CardContent>
              </Card>
              <ExceptionsBoard
                groups={exceptionGroups}
                onSelect={(row) => setSelectedEmployee(row.employeeId)}
                onPrint={(rows) => {
                  const common = exportCommon();
                  if (!common) return;
                  const opened = printAttendanceSheet({ ...common, rows });
                  if (!opened) toast.error('المتصفح منع نافذة الطباعة');
                }}
                onExcel={(rows) => {
                  const common = exportCommon();
                  if (!common) return;
                  downloadAttendanceExcel({ deviceName: common.deviceName, fromDate: common.fromDate, toDate: common.toDate, rows });
                  toast.success('تم تنزيل ملف الإكسل');
                }}
              />
              </>
            )
          )}

              {panel === 'live' && (
            <PunchLog
              punches={day?.punches ?? []}
              freshKeys={freshKeys}
              live
              onAssign={openAssign}
              onSelectEmployee={setSelectedEmployee}
            />
          )}

          {panel === 'summary' && (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold text-gray-900">
                      <Users className="h-5 w-5" />
                      ملخص الموظفين — {fromDate} إلى {toDate}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">اضغط على أي موظف لعرض تفاصيل أيامه وبصماته. يتأثر الملخص بالبحث والقسم والوحدة.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={!baseRoster.length || !day}
                    onClick={() => {
                      const common = exportCommon();
                      if (!common) return;
                      downloadAttendanceExcel({ ...common, rows: sortRows(baseRoster, 'name', 'asc') });
                      toast.success('تم تنزيل ملف الإكسل (يحوي ورقة الملخص)');
                    }}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    إكسل
                  </Button>
                </div>
                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      className="pr-10"
                      placeholder="بحث بالاسم أو المعرف أو الوظيفة"
                      value={nameQuery}
                      onChange={(e) => setNameQuery(e.target.value)}
                    />
                  </div>
                  <select
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm"
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                  >
                    <option value="">كل الأقسام</option>
                    {departmentNames.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <select
                    className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm"
                    value={unitFilter}
                    onChange={(e) => setUnitFilter(e.target.value)}
                  >
                    <option value="">كل الوحدات</option>
                    {units.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                {dayLoading ? <Skeleton className="h-64 w-full rounded-2xl" /> : <SummaryTable items={employeeSummaries} onSelect={setSelectedEmployee} />}
              </CardContent>
            </Card>
          )}

          {panel === 'sheet' && (
            <div className="flex flex-wrap gap-1 rounded-2xl border border-gray-100 bg-white p-1">
              {statusChips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setStatusFilter(c.key)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                    statusFilter === c.key ? 'bg-primary-700 text-white' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{c.label}</span>
                  <span className={`font-semibold tabular-nums ${statusFilter === c.key ? 'text-white' : c.className ?? ''}`}>{c.value}</span>
                </button>
              ))}
            </div>
          )}

          {panel === 'sheet' && (
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-semibold text-gray-900">
                  <Clock3 className="h-5 w-5" />
                  الكشف {day?.fromDate && day?.toDate ? `— ${day.fromDate} إلى ${day.toDate}` : ''}
                  <span className="text-sm font-normal text-gray-500">({filteredRoster.length})</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="gap-1"
                    disabled={!sortedRoster.length || !day}
                    onClick={() => {
                      const common = exportCommon();
                      if (!common) return;
                      const opened = printAttendanceSheet({ ...common, rows: sortedRoster });
                      if (!opened) toast.error('المتصفح منع نافذة الطباعة');
                    }}
                  >
                    <Printer className="h-4 w-4" />
                    طباعة
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={!sortedRoster.length}
                    onClick={() => {
                      const common = exportCommon();
                      if (!common) return;
                      downloadAttendanceExcel({
                        deviceName: common.deviceName,
                        fromDate: common.fromDate,
                        toDate: common.toDate,
                        rows: sortedRoster,
                      });
                      toast.success('تم تنزيل ملف الإكسل');
                    }}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    إكسل
                  </Button>
                  {(['official', 'detailed'] as const).map((layout) => (
                    <Button
                      key={layout}
                      size="sm"
                      variant={layout === 'official' ? 'default' : 'outline'}
                      className="gap-1"
                      disabled={!day || !sortedRoster.length || Boolean(pdfBusy)}
                      onClick={() => runPdf(layout)}
                    >
                      <FileDown className="h-4 w-4" />
                      {pdfBusy === layout ? pdfLabel : layout === 'official' ? 'كشف رسمي' : 'كشف مفصل'}
                    </Button>
                  ))}
                </div>
              </div>

              {noScheduleCount > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  <span>
                    {noScheduleCount} صف بلا جدول دوام، لذلك تبقى خانات التأخير والإضافي فارغة فيها.
                  </span>
                  <button
                    type="button"
                    onClick={() => setNoScheduleOnly((v) => !v)}
                    className="rounded-full border border-orange-300 bg-white px-3 py-0.5 text-xs font-medium hover:bg-orange-100"
                  >
                    {noScheduleOnly ? 'عرض الكل' : 'عرضها فقط'}
                  </button>
                </div>
              )}

              <div className="mb-4 grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    ref={searchRef}
                    className="pr-10"
                    placeholder="بحث بالاسم أو المعرف أو الوظيفة   ( اضغط / )"
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                  />
                </div>
                <select
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm"
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                >
                  <option value="">كل الأقسام</option>
                  {departmentNames.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <select
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm"
                  value={unitFilter}
                  onChange={(e) => setUnitFilter(e.target.value)}
                >
                  <option value="">كل الوحدات</option>
                  {units.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <ColumnPicker visible={columns} onChange={setColumns} />
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex h-9 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      مسح الفلاتر
                    </button>
                  )}
                </div>
              </div>

              {dayLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
              ) : !day?.roster.length ? (
                <EmptyState
                  icon={Fingerprint}
                  title="لا توجد صفوف في هذه الفترة"
                  description="لا يوجد موظفون معرّفون على هذا الجهاز، أو لا توجد أيام ضمن النطاق."
                />
              ) : (
                <SheetTable
                  rows={sortedRoster}
                  visible={columns}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  onSelect={(row) => setSelectedEmployee(row.employeeId)}
                  resetKey={resetKey}
                  multiDay={multiDay && sortKey === 'none'}
                  today={today}
                />
              )}
            </CardContent>
          </Card>
          )}

              {panel === 'log' && (
            <PunchLog
              punches={day?.punches ?? []}
              onAssign={openAssign}
              onSelectEmployee={setSelectedEmployee}
            />
          )}
        </>
      )}

      <EmployeeModal
        employeeId={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        rows={day?.roster ?? []}
        punches={day?.punches ?? []}
        deviceName={day?.deviceName ?? ''}
        serial={day?.serial ?? ''}
        departmentName={day?.deviceDepartment?.name ?? null}
        fromDate={fromDate}
        toDate={toDate}
      />

      <Modal
        open={Boolean(assignPin)}
        onClose={() => setAssignPin(null)}
        title={`ربط المعرف ${assignPin ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            قسم الجهاز: {day?.deviceDepartment?.name || 'غير محدد'}
          </p>
          <Input
            placeholder="ابحث عن اسم الموظف"
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={moveDept} onChange={(e) => setMoveDept(e.target.checked)} />
            البحث في كل الأقسام ونقل الموظف إلى قسم هذا الجهاز
          </label>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {(empQuery.data?.data ?? []).map((emp) => (
              <button
                key={emp.id}
                type="button"
                disabled={assignMutation.isPending}
                onClick={() => assignMutation.mutate({ employeeId: emp.id, moveToDepartment: moveDept })}
                className="w-full rounded-xl px-3 py-2 text-right text-sm hover:bg-gray-50"
              >
                <div className="font-medium">{emp.fullName}</div>
                <div className="text-xs text-gray-500">
                  {emp.jobTitle}
                  {emp.department?.name ? ` — ${emp.department.name}` : ''}
                </div>
              </button>
            ))}
            {assignPin && empSearch.trim().length >= 2 && !empQuery.isFetching && !(empQuery.data?.data ?? []).length && (
              <p className="text-sm text-gray-500">لا توجد نتائج ضمن القسم. فعّل النقل للبحث في الأقسام الأخرى.</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
