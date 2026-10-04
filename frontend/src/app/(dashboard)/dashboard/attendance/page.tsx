'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, FileDown, Fingerprint, RefreshCw, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api';
import { downloadAttendancePdf, rosterMatchesStatus, type AttendancePdfLayout, type AttendanceStatusFilter } from '@/lib/attendance-pdf';
import { hospitalClock, hospitalDateTime } from '@/lib/hospital-clock';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { Modal } from '@/components/ui/modal';
import { useDebounce } from '@/hooks/use-debounce';

type Inbox = {
  boundDevices: { id: string; name: string; serial: string; fingerprintCount: number }[];
  unboundSerials: { serial: string; lastSeenAt: string; requestCount: number }[];
  linkableDevices: { id: string; name: string; serial: string | null; fingerprintCount: number; bound: boolean }[];
};

type RosterRow = {
  employeeId: string;
  fingerprintId: string;
  employeeName: string;
  jobTitle: string;
  departmentName: string | null;
  unitName: string | null;
  workDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  expectedMinutes: number | null;
  workedMinutes: number | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  displayMode: 'pair' | 'single' | null;
  punchCount: number;
  status: 'PRESENT' | 'SINGLE' | 'ABSENT' | 'LEAVE' | 'REST' | 'HOLIDAY';
  statusLabel: string;
};

type PunchLogRow = {
  fingerprintId: string;
  scannedAt: string;
  employeeId: string | null;
  employeeName: string | null;
  unitName: string | null;
  matched: boolean;
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

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function formatTime(iso: string | null) {
  return hospitalClock(iso);
}

function formatDateTime(iso: string) {
  return hospitalDateTime(iso);
}

function formatDuration(mins: number | null | undefined) {
  if (mins == null) return '—';
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}د`;
  if (m === 0) return `${h}س`;
  return `${h}س ${m}د`;
}

type StatusFilter = AttendanceStatusFilter;

function statusClass(status: RosterRow['status']) {
  if (status === 'PRESENT') return 'bg-emerald-50 text-emerald-800';
  if (status === 'SINGLE') return 'bg-sky-50 text-sky-800';
  if (status === 'LEAVE') return 'bg-violet-50 text-violet-800';
  if (status === 'REST' || status === 'HOLIDAY') return 'bg-slate-100 text-slate-700';
  return 'bg-red-50 text-red-700';
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [fromDate, setFromDate] = useState(isoDate(new Date()));
  const [toDate, setToDate] = useState(isoDate(new Date()));
  const [deviceId, setDeviceId] = useState('');
  const [bindDeviceId, setBindDeviceId] = useState('');
  const [panel, setPanel] = useState<'sheet' | 'unmatched' | 'live' | 'log'>('sheet');
  const [nameQuery, setNameQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [assignPin, setAssignPin] = useState<string | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [moveDept, setMoveDept] = useState(false);
  const debouncedEmpSearch = useDebounce(empSearch, 300);
  const seenPunches = useRef<Set<string>>(new Set());
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState<AttendancePdfLayout | null>(null);
  const [pdfLabel, setPdfLabel] = useState('');
  const [unmatchedFrom, setUnmatchedFrom] = useState('');
  const [unmatchedTo, setUnmatchedTo] = useState('');

  const inboxQuery = useQuery({
    queryKey: ['adms-inbox'],
    queryFn: () => apiGet<Inbox>('/api/devices/adms-inbox'),
  });

  const bound = inboxQuery.data?.boundDevices ?? [];
  const unbound = inboxQuery.data?.unboundSerials ?? [];
  const linkable = inboxQuery.data?.linkableDevices ?? [];

  useEffect(() => {
    if (!deviceId && bound[0]) setDeviceId(bound[0].id);
  }, [bound, deviceId]);

  useEffect(() => {
    if (!bindDeviceId && linkable[0]) setBindDeviceId(linkable[0].id);
  }, [linkable, bindDeviceId]);

  const selected = useMemo(() => bound.find((d) => d.id === deviceId) ?? bound[0] ?? null, [bound, deviceId]);
  const activeId = selected?.id ?? '';

  const dayQuery = useQuery({
    queryKey: ['live-day', activeId, fromDate, toDate],
    enabled: Boolean(activeId),
    refetchInterval: 20000,
    queryFn: () =>
      apiGet<LiveDay>(
        `/api/devices/${activeId}/live-day?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}`,
      ),
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
  const counts = day?.counts;

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

  const filteredRoster = useMemo(() => {
    const q = nameQuery.trim();
    return (day?.roster ?? []).filter((r) => {
      if (q && !r.employeeName.includes(q) && !r.fingerprintId.includes(q) && !r.jobTitle.includes(q)) return false;
      if (departmentFilter && r.departmentName !== departmentFilter) return false;
      if (unitFilter && r.unitName !== unitFilter) return false;
      return rosterMatchesStatus(r, statusFilter);
    });
  }, [day?.roster, nameQuery, departmentFilter, unitFilter, statusFilter]);

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
      rows: filteredRoster,
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
    { id: 'unmatched' as const, label: 'معرفات بلا موظف', count: unmatchedQuery.data?.total ?? 0 },
    { id: 'live' as const, label: 'البث', count: day?.punches.length ?? 0 },
    { id: 'log' as const, label: 'السجل', count: day?.punches.length ?? 0 },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الحضور والانصراف</h1>
          <p className="mt-1 text-sm text-gray-600 print:hidden">
            {selected ? `${selected.name} · ${selected.fingerprintCount} معرف مسجّل` : 'اختر الجهاز ثم الفترة'}
          </p>
        </div>
        <Button
          onClick={() => {
            inboxQuery.refetch();
            dayQuery.refetch();
          }}
          disabled={inboxQuery.isFetching || dayQuery.isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${inboxQuery.isFetching || dayQuery.isFetching ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
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
            <CardContent className="space-y-4 p-5">
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
              <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                <div className="min-w-[200px]">
                  <label className="mb-1 block text-xs text-gray-500">قسم الجهاز</label>
                  <select
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
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
                <div>
                  <label className="mb-1 block text-xs text-gray-500">من تاريخ</label>
                  <input
                    type="date"
                    className="h-10 rounded-md border border-gray-200 px-3 text-sm"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">إلى تاريخ</label>
                  <input
                    type="date"
                    className="h-10 rounded-md border border-gray-200 px-3 text-sm"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => { const t = isoDate(new Date()); setFromDate(t); setToDate(t); }}>
                  اليوم
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setFromDate(shiftDate(isoDate(new Date()), -6)); setToDate(isoDate(new Date())); }}>
                  7 أيام
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setFromDate(shiftDate(isoDate(new Date()), -13)); setToDate(isoDate(new Date())); }}>
                  14 يوماً
                </Button>
                <div className="ms-auto flex flex-wrap gap-1 rounded-full bg-gray-100 p-1">
                  {viewTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPanel(tab.id)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${
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
              </div>
            </CardContent>
          </Card>

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
                              onClick={() => {
                                setAssignPin(pin.fingerprintId);
                                setEmpSearch('');
                                setMoveDept(false);
                              }}
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

          {dayQuery.isError && (
            <Card>
              <CardContent className="p-5 text-sm text-red-600">{(dayQuery.error as Error).message}</CardContent>
            </Card>
          )}

          {panel === 'sheet' && counts && (
            <div className="flex flex-wrap gap-1 rounded-2xl border border-gray-100 bg-white p-1">
              {[
                { key: 'all' as StatusFilter, label: 'الكل', value: counts.rows ?? counts.employees },
                { key: 'present' as StatusFilter, label: 'حاضر', value: counts.present, className: 'text-emerald-700' },
                { key: 'late' as StatusFilter, label: 'متأخر', value: counts.late, className: 'text-orange-700' },
                { key: 'overtime' as StatusFilter, label: 'إضافي', value: counts.overtime, className: 'text-sky-700' },
                { key: 'absent' as StatusFilter, label: 'غائب', value: counts.absent, className: 'text-red-700' },
                { key: 'leave' as StatusFilter, label: 'إجازة', value: counts.leave, className: 'text-violet-700' },
                { key: 'rest' as StatusFilter, label: 'استراحة', value: counts.rest },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setStatusFilter(c.key)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                    statusFilter === c.key ? 'bg-primary-700 text-white' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{c.label}</span>
                  <span className={`font-semibold ${statusFilter === c.key ? 'text-white' : c.className ?? ''}`}>{c.value}</span>
                </button>
              ))}
            </div>
          )}

          {panel === 'live' && (
            <Card className="border-emerald-100 bg-emerald-50/40" data-print-hide>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">البث المباشر</h2>
                  <span className="text-xs text-emerald-800">يتحدّث تلقائياً</span>
                </div>
                <ul className="space-y-2">
                  {(day?.punches ?? []).slice(0, 12).map((p, i) => {
                    const key = `${p.fingerprintId}|${p.scannedAt}`;
                    const isNew = freshKeys.has(key);
                    return (
                    <li key={`${key}-${i}`} className={`rounded-xl px-3 py-2 text-sm ${isNew ? 'bg-emerald-100' : 'bg-white'}`}>
                      {isNew ? <span className="ml-2 rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] text-white">جديد</span> : null}
                      {p.matched ? (
                        <>
                          بصمة جديدة بواسطة <span className="font-semibold">{p.employeeName}</span>
                          {p.unitName ? ` — ${p.unitName}` : ''} في {formatDateTime(p.scannedAt)}
                          {' '}(معرف {p.fingerprintId})
                        </>
                      ) : (
                        <>
                          بصمة بمعرف غير مربوط <span className="font-mono font-semibold">{p.fingerprintId}</span> في {formatDateTime(p.scannedAt)}
                        </>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}


          {panel === 'sheet' && (
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-semibold text-gray-900">
                  <Clock3 className="h-5 w-5" />
                  الكشف {day?.fromDate && day?.toDate ? `— ${day.fromDate} إلى ${day.toDate}` : ''}
                  <span className="text-sm font-normal text-gray-500">({filteredRoster.length})</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {(['official', 'detailed'] as const).map((layout) => (
                    <Button
                      key={layout}
                      size="sm"
                      variant={layout === 'official' ? 'default' : 'outline'}
                      className="gap-1"
                      disabled={!day || Boolean(pdfBusy)}
                      onClick={() => runPdf(layout)}
                    >
                      <FileDown className="h-4 w-4" />
                      {pdfBusy === layout ? pdfLabel : layout === 'official' ? 'كشف رسمي' : 'كشف مفصل'}
                    </Button>
                  ))}
                </div>
              </div>
              {filteredRoster.some((row) => (row.status === 'PRESENT' || row.status === 'SINGLE' || row.status === 'ABSENT') && !row.scheduledStart) && (
                <p className="mb-3 text-sm text-orange-800">
                  بعض صفوف هذا الكشف بلا جدول دوام، لذلك تبقى خانات التأخير والإضافي فارغة فيها.
                </p>
              )}
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    className="pr-10"
                    placeholder="بحث بالاسم أو المعرف"
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
              {dayQuery.isLoading ? (
                <p className="text-sm text-gray-500">جاري إعداد الكشف…</p>
              ) : !day?.roster.length ? (
                <p className="text-sm text-gray-500">لا يوجد موظفون معرفون على هذا الجهاز.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-right text-gray-500">
                        <th className="px-3 py-2 font-medium">التاريخ</th>
                        <th className="px-3 py-2 font-medium">المعرف</th>
                        <th className="px-3 py-2 font-medium">الاسم</th>
                        <th className="px-3 py-2 font-medium">الوحدة</th>
                        <th className="px-3 py-2 font-medium">الدوام المطلوب</th>
                        <th className="px-3 py-2 font-medium">حضور</th>
                        <th className="px-3 py-2 font-medium">انصراف</th>
                        <th className="px-3 py-2 font-medium">ساعات الدوام</th>
                        <th className="px-3 py-2 font-medium">العمل الفعلي</th>
                        <th className="px-3 py-2 font-medium">تأخير</th>
                        <th className="px-3 py-2 font-medium">إضافي</th>
                        <th className="px-3 py-2 font-medium">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRoster.map((row) => (
                        <tr key={`${row.employeeId}-${row.workDate}`} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono">{row.workDate}</td>
                          <td className="px-3 py-2 font-mono">{row.fingerprintId}</td>
                          <td className="px-3 py-2">
                            <div>{row.employeeName}</div>
                            <div className="text-xs text-gray-500">{row.jobTitle}</div>
                          </td>
                          <td className="px-3 py-2">{row.unitName || '—'}</td>
                          <td className="px-3 py-2 font-mono">
                            {row.status === 'REST' || row.status === 'LEAVE' || row.status === 'HOLIDAY'
                              ? '—'
                              : row.scheduledStart && row.scheduledEnd
                                ? `${row.scheduledStart} – ${row.scheduledEnd}`
                                : '—'}
                          </td>
                          <td className="px-3 py-2 font-mono">{formatTime(row.checkInAt)}</td>
                          <td className="px-3 py-2 font-mono">{formatTime(row.checkOutAt)}</td>
                          <td className="px-3 py-2">{formatDuration(row.expectedMinutes)}</td>
                          <td className="px-3 py-2">{formatDuration(row.workedMinutes)}</td>
                          <td className="px-3 py-2">{formatDuration(row.lateMinutes)}</td>
                          <td className="px-3 py-2">{formatDuration(row.overtimeMinutes)}</td>
                          <td className="px-3 py-2">
                            <Badge className={row.lateMinutes > 0 && (row.status === 'PRESENT' || row.status === 'SINGLE') ? 'bg-orange-50 text-orange-800' : statusClass(row.status)}>{row.statusLabel}</Badge>
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

          {panel === 'log' && (
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-semibold text-gray-900">
                <Fingerprint className="h-5 w-5" />
                سجل البصمات
              </h2>
              <p className="mb-3 text-xs text-gray-500">كل البصمات كما وصلت. الكشف يدمج البصمتين إذا كان الفرق أقل من ساعتين.</p>
              {(
                !day?.punches.length ? (
                  <p className="text-sm text-gray-500">لا توجد بصمات في هذا اليوم.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b text-right text-gray-500">
                          <th className="px-3 py-2 font-medium">الوقت</th>
                          <th className="px-3 py-2 font-medium">المعرف</th>
                          <th className="px-3 py-2 font-medium">الاسم</th>
                          <th className="px-3 py-2 font-medium">الوحدة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.punches.map((p, i) => (
                          <tr key={`${p.fingerprintId}-${p.scannedAt}-${i}`} className="border-b last:border-0">
                            <td className="px-3 py-2 font-mono">{formatDateTime(p.scannedAt)}</td>
                            <td className="px-3 py-2 font-mono">{p.fingerprintId}</td>
                            <td className="px-3 py-2">{p.employeeName || 'غير معرف على هذا الجهاز'}</td>
                            <td className="px-3 py-2">{p.unitName || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </CardContent>
          </Card>
          )}
        </>
      )}

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
