'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ClipboardList, Plus, Clock, Copy, Search, CopyPlus, Calendar, FileText, ChevronDown, ChevronLeft, Building2, CheckCircle, Trash2 } from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-debounce';

type Schedule = {
  id: string;
  year: number;
  month: number;
  workType: string;
  shiftPattern: string | null;
  daysOfWeek: string;
  cycleStartDate: string | null;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  status?: 'PENDING' | 'APPROVED';
  approvedById?: string | null;
  approvedAt?: string | null;
  approvedBy?: { id: string; name: string } | null;
  employee: { id: string; fullName: string; department: { id: string; name: string }; workType: string };
};

type EmployeeOption = { id: string; fullName: string; department?: { id: string; name: string } };

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const SHIFT_PATTERNS = [
  { value: '1x1', label: '١×١ (يوم عمل، يوم استراحة)' },
  { value: '1x2', label: '١×٢ (يوم عمل، يومان استراحة)' },
  { value: '1x3', label: '١×٣ (يوم عمل، ثلاثة أيام استراحة)' },
  { value: 'FIXED', label: 'ثابت (أيام أسبوعية محددة)' },
];

function formatDays(s: string) {
  return s
    .split(',')
    .map((i) => DAYS[parseInt(i, 10)] ?? '')
    .filter(Boolean)
    .join('، ');
}

function formatShiftPattern(p: string | null) {
  if (!p) return '';
  const found = SHIFT_PATTERNS.find((x) => x.value === p);
  return found?.label ?? p;
}

function parseTimeToHours(t: string): number {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

function calcMonthlyHours(form: {
  workType: string;
  shiftPattern: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
}): number | null {
  const hoursPerDay = parseTimeToHours(form.endTime) - parseTimeToHours(form.startTime);
  if (hoursPerDay <= 0) return null;
  const WEEKS_PER_MONTH = 365 / 12 / 7;
  if (form.workType === 'MORNING' || (form.workType === 'SHIFTS' && form.shiftPattern === 'FIXED')) {
    const days = form.daysOfWeek.split(',').filter(Boolean).length;
    if (days === 0) return null;
    return Math.round(hoursPerDay * days * WEEKS_PER_MONTH * 10) / 10;
  }
  if (form.workType === 'SHIFTS' && form.shiftPattern) {
    const daysPerMonth = form.shiftPattern === '1x1' ? 15.2 : form.shiftPattern === '1x2' ? 10.2 : form.shiftPattern === '1x3' ? 7.6 : 0;
    if (daysPerMonth === 0) return null;
    return Math.round(hoursPerDay * daysPerMonth * 10) / 10;
  }
  return null;
}

function formatHoursMinutes(decimalHours: number): string {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (m === 0) return `${h} ساعة`;
  return `${h} ساعة و ${m} دقيقة`;
}

export default function SchedulesPage() {
  const now = new Date();
  const [addOpen, setAddOpen] = useState(false);
  const [copyMonthOpen, setCopyMonthOpen] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [departmentId, setDepartmentId] = useState<string>('');
  const [employeeScheduleSearch, setEmployeeScheduleSearch] = useState('');
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<string>>(new Set());
  const [canApproveSchedules, setCanApproveSchedules] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const u = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      const p = u ? (JSON.parse(u)?.permissions ?? []) as string[] : [];
      setCanApproveSchedules(p.includes('ADMIN') || p.includes('SCHEDULES_APPROVE'));
    } catch {
      setCanApproveSchedules(false);
    }
  }, []);
  const [copyFromId, setCopyFromId] = useState<string>('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const debouncedEmployeeSearch = useDebounce(employeeSearch.trim(), 350);
  const [form, setForm] = useState({
    workType: 'MORNING',
    shiftPattern: '',
    daysOfWeek: '1,2,3,4,5',
    cycleStartDate: new Date().toISOString().slice(0, 10),
    startTime: '08:00',
    endTime: '15:00',
  });
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [copyFromForm, setCopyFromForm] = useState({
    sourceYear: lastMonth.getFullYear(),
    sourceMonth: lastMonth.getMonth(),
  });
  const queryClient = useQueryClient();

  const { data: scheduleDepartmentsRes } = useQuery({
    queryKey: ['schedule-departments'],
    queryFn: () =>
      apiGet<{ departmentIds: string[]; departments: { id: string; name: string }[] }>(
        '/api/users/me/schedule-departments'
      ),
  });
  const deptsFromApi = scheduleDepartmentsRes?.departments ?? [];

  const empParams = new URLSearchParams();
  empParams.set('limit', '500');
  empParams.set('includeInactive', 'true');
  if (departmentId) empParams.set('departmentId', departmentId);
  if (debouncedEmployeeSearch) empParams.set('search', debouncedEmployeeSearch);

  const { data: employeesRes, isFetching: employeesLoading } = useQuery({
    queryKey: ['employees-for-schedules', departmentId, debouncedEmployeeSearch],
    queryFn: () =>
      apiGet<{ data: EmployeeOption[] }>(`/api/employees?${empParams}`),
  });

  const schedParams = new URLSearchParams();
  schedParams.set('year', String(year));
  schedParams.set('month', String(month));
  if (departmentId) schedParams.set('departmentId', departmentId);

  const { data: schedules, isLoading, error } = useQuery({
    queryKey: ['work-schedules', year, month, departmentId],
    queryFn: () => apiGet<Schedule[]>(`/api/work-schedules?${schedParams}`),
  });

  const { data: availableMonths } = useQuery({
    queryKey: ['work-schedules-months', departmentId],
    queryFn: () =>
      apiGet<{ year: number; month: number }[]>(
        `/api/work-schedules/months${departmentId ? `?departmentId=${departmentId}` : ''}`
      ),
  });

  const addMutation = useMutation({
    mutationFn: (body: { employeeId: string } & typeof form) =>
      apiPost('/api/work-schedules', {
        employeeId: body.employeeId,
        year,
        month,
        workType: body.workType,
        shiftPattern: body.workType === 'SHIFTS' ? body.shiftPattern || null : null,
        daysOfWeek: body.workType === 'MORNING' || (body.workType === 'SHIFTS' && body.shiftPattern === 'FIXED') ? body.daysOfWeek : '0',
        cycleStartDate: body.workType === 'SHIFTS' && body.shiftPattern && body.shiftPattern !== 'FIXED' ? body.cycleStartDate : undefined,
        startTime: body.startTime,
        endTime: body.endTime,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['work-schedules-months'] });
      setAddOpen(false);
      setSelectedEmployeeIds([]);
      toast.success('تم حفظ الجدول');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMutation = useMutation({
    mutationFn: (body: { employeeIds: string[] } & typeof form) =>
      apiPost<{ applied: number; failed: number }>('/api/work-schedules/bulk', {
        employeeIds: body.employeeIds,
        year,
        month,
        workType: body.workType,
        shiftPattern: body.workType === 'SHIFTS' ? body.shiftPattern || null : null,
        daysOfWeek: body.workType === 'MORNING' || (body.workType === 'SHIFTS' && body.shiftPattern === 'FIXED') ? body.daysOfWeek : '0',
        cycleStartDate: body.workType === 'SHIFTS' && body.shiftPattern && body.shiftPattern !== 'FIXED' ? body.cycleStartDate : undefined,
        startTime: body.startTime,
        endTime: body.endTime,
      }),
    onSuccess: (res: { applied: number; failed: number }) => {
      queryClient.invalidateQueries({ queryKey: ['work-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['work-schedules-months'] });
      toast.success(`تم تطبيق الجدول على ${res.applied} موظف`);
      if (res.failed > 0) toast.error(`فشل ${res.failed} موظف`);
      setAddOpen(false);
      setSelectedEmployeeIds([]);
    },
  });

  const copyMonthMutation = useMutation({
    mutationFn: () =>
      apiPost<{ copied: number }>('/api/work-schedules/copy-from-month', {
        sourceYear: copyFromForm.sourceYear,
        sourceMonth: copyFromForm.sourceMonth + 1,
        targetYear: year,
        targetMonth: month,
        departmentId: departmentId || undefined,
      }),
    onSuccess: (res: { copied: number }) => {
      queryClient.invalidateQueries({ queryKey: ['work-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['work-schedules-months'] });
      setCopyMonthOpen(false);
      toast.success(`تم نسخ ${res.copied} جدول من الشهر المحدد`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveDepartmentMutation = useMutation({
    mutationFn: (params: { year: number; month: number; departmentId: string }) =>
      apiPost('/api/work-schedules/approve-department-month', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-schedules'] });
      toast.success('تم اعتماد جدول القسم');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => apiDelete(`/api/work-schedules/${scheduleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['work-schedules-months'] });
      toast.success('تم حذف الجدول');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (copyFromId && schedules) {
      const s = schedules.find((x) => x.employee.id === copyFromId || x.id === copyFromId);
      if (s) {
        setForm({
          workType: s.workType,
          shiftPattern: s.shiftPattern ?? '',
          daysOfWeek: s.daysOfWeek,
          cycleStartDate: s.cycleStartDate ? new Date(s.cycleStartDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          startTime: s.startTime,
          endTime: s.endTime,
        });
      }
    }
  }, [copyFromId, schedules]);

  const depts = deptsFromApi;
  const employees = employeesRes?.data ?? [];
  const list = schedules ?? [];

  const listForView = useMemo(() => {
    const q = employeeScheduleSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => s.employee.fullName.toLowerCase().includes(q));
  }, [list, employeeScheduleSearch]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, { name: string; schedules: Schedule[] }>();
    for (const s of listForView) {
      const id = s.employee.department?.id ?? '_no_dept';
      const name = s.employee.department?.name ?? 'بدون قسم';
      if (!map.has(id)) map.set(id, { name, schedules: [] });
      map.get(id)!.schedules.push(s);
    }
    return Array.from(map.entries());
  }, [listForView]);

  useEffect(() => {
    if (departmentId && byDepartment.some(([id]) => id === departmentId)) {
      setExpandedDeptIds((prev) => new Set(prev).add(departmentId));
    }
  }, [departmentId, byDepartment.length]);

  const toggleDepartment = (id: string) => {
    setExpandedDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredEmployees =
    employeeSearch.trim() && !debouncedEmployeeSearch
      ? employees.filter(
          (e) =>
            e.fullName.toLowerCase().includes(employeeSearch.toLowerCase()) ||
            (e.department?.name?.toLowerCase().includes(employeeSearch.toLowerCase()))
        )
      : employees;

  const toggleDay = (dayIndex: number) => {
    const current = form.daysOfWeek.split(',').filter(Boolean).map(Number);
    const set = new Set(current);
    if (set.has(dayIndex)) set.delete(dayIndex);
    else set.add(dayIndex);
    setForm((f) => ({
      ...f,
      daysOfWeek: Array.from(set).sort((a, b) => a - b).join(','),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmployeeIds.length > 1) {
      bulkMutation.mutate({ ...form, employeeIds: selectedEmployeeIds });
    } else if (selectedEmployeeIds.length === 1) {
      addMutation.mutate({ ...form, employeeId: selectedEmployeeIds[0] });
    } else {
      toast.error('اختر موظفاً واحداً على الأقل');
    }
  };

  const toggleEmployee = (id: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">جداول الدوام</h1>
            <p className="text-gray-500 mt-1">
              إدارة جداول الدوام الشهرية حسب السنة والشهر والقسم
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild className="gap-2 min-h-[44px]">
              <Link href="/dashboard/schedules/official-report">
                <FileText className="h-4 w-4" />
                تقرير جدول الدوام الرسمي
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setCopyMonthOpen(true)} className="gap-2 min-h-[44px]">
              <CopyPlus className="h-4 w-4" />
              نسخ من شهر سابق
            </Button>
            <Button onClick={() => setAddOpen(true)} className="gap-2 min-h-[44px]">
              <Plus className="h-5 w-5" />
              إضافة / تعديل جدول
            </Button>
          </div>
        </div>

        {/* فلتر السنة والشهر والقسم + بحث عن موظف */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">العرض:</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="sr-only">السنة</label>
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10))}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm min-h-[44px]"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sr-only">الشهر</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm min-h-[44px]"
                >
                  {MONTHS_AR.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sr-only">القسم</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm min-w-[140px] min-h-[44px]"
                >
                  <option value="">كل الأقسام</option>
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex-1 min-w-[200px] max-w-md">
              <label className="sr-only">بحث عن موظف</label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="search"
                  value={employeeScheduleSearch}
                  onChange={(e) => setEmployeeScheduleSearch(e.target.value)}
                  placeholder="بحث عن موظف لمشاهدة جدول دوامه..."
                  className="pr-10 rounded-xl border-gray-200"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 w-full sm:w-auto">
              جدول دوام: <strong>{MONTHS_AR[month - 1]} {year}</strong>
              {departmentId && depts.find((d) => d.id === departmentId) && (
                <> — <strong>{depts.find((d) => d.id === departmentId)!.name}</strong></>
              )}
              {employeeScheduleSearch.trim() && (
                <> — عرض النتائج المطابقة للبحث</>
              )}
            </p>
          </div>
        </Card>
      </div>

      {/* مودال نسخ من شهر سابق */}
      <Modal
        open={copyMonthOpen}
        onClose={() => setCopyMonthOpen(false)}
        title="نسخ الجدول من شهر سابق"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            سيتم نسخ جداول الدوام من الشهر المحدد إلى شهر {MONTHS_AR[month - 1]} {year}
            {departmentId && <> للقسم المحدد</>}، ويمكنك تعديلها بعد ذلك.
          </p>
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">السنة</label>
              <select
                value={copyFromForm.sourceYear}
                onChange={(e) => setCopyFromForm((f) => ({ ...f, sourceYear: parseInt(e.target.value, 10) }))}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 w-full"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الشهر</label>
              <select
                value={copyFromForm.sourceMonth}
                onChange={(e) => setCopyFromForm((f) => ({ ...f, sourceMonth: parseInt(e.target.value, 10) }))}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 w-full"
              >
                {MONTHS_AR.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => copyMonthMutation.mutate()} disabled={copyMonthMutation.isPending} className="min-h-[44px]">
              {copyMonthMutation.isPending ? 'جاري النسخ...' : 'نسخ'}
            </Button>
            <Button variant="secondary" onClick={() => setCopyMonthOpen(false)} className="min-h-[44px]">
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setSelectedEmployeeIds([]);
          setCopyFromId('');
          setEmployeeSearch('');
        }}
        title={`إضافة / تعديل جدول دوام — ${MONTHS_AR[month - 1]} ${year}`}
        className="max-w-5xl"
      >
        <form onSubmit={handleSubmit}>
          <div className="rounded-xl bg-primary-50/80 border border-primary-100 p-4 mb-5">
            <p className="text-sm text-primary-800">
              الخطوة ١: اختر نوع الدوام. الخفراء لا يستفيدون من العطل الرسمية. الجدول يُحفظ لشهر {MONTHS_AR[month - 1]} {year}.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">نوع الدوام</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border-2 flex-1 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                    <input
                      type="radio"
                      name="workType"
                      value="MORNING"
                      checked={form.workType === 'MORNING'}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          workType: 'MORNING',
                          shiftPattern: '',
                          daysOfWeek: '1,2,3,4,5',
                        }))
                      }
                      className="text-primary-600"
                    />
                    <span className="text-sm">صباحي</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border-2 flex-1 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50">
                    <input
                      type="radio"
                      name="workType"
                      value="SHIFTS"
                      checked={form.workType === 'SHIFTS'}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          workType: 'SHIFTS',
                          shiftPattern: '1x2',
                          daysOfWeek: '',
                        }))
                      }
                      className="text-primary-600"
                    />
                    <span className="text-sm">خفر</span>
                  </label>
                </div>
              </div>

              {form.workType === 'SHIFTS' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">نمط الخفر</label>
                  <div className="grid grid-cols-2 gap-2">
                    {SHIFT_PATTERNS.map((p) => (
                      <label
                        key={p.value}
                        className="flex items-center gap-2 cursor-pointer p-3 rounded-xl border has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50"
                      >
                        <input
                          type="radio"
                          name="shiftPattern"
                          value={p.value}
                          checked={form.shiftPattern === p.value}
                          onChange={() =>
                            setForm((f) => ({
                              ...f,
                              shiftPattern: p.value,
                              daysOfWeek: p.value === 'FIXED' ? '1,2,3,4,5' : '',
                              cycleStartDate: p.value !== 'FIXED' ? new Date().toISOString().slice(0, 10) : f.cycleStartDate,
                            }))
                          }
                          className="text-primary-600"
                        />
                        <span className="text-sm">{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {(form.workType === 'MORNING' || (form.workType === 'SHIFTS' && form.shiftPattern === 'FIXED')) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">أيام العمل</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((name, idx) => {
                      const selected = form.daysOfWeek.split(',').map(Number).includes(idx);
                      return (
                        <label
                          key={idx}
                          className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl border-2 transition-colors ${
                            selected ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleDay(idx)}
                            className="sr-only"
                          />
                          <span className="text-sm font-medium">{name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {form.workType === 'SHIFTS' && form.shiftPattern && form.shiftPattern !== 'FIXED' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">تاريخ بداية الدورة</label>
                  <Input
                    type="date"
                    value={form.cycleStartDate}
                    onChange={(e) => setForm((f) => ({ ...f, cycleStartDate: e.target.value }))}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">من</label>
                  <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">إلى</label>
                  <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              {calcMonthlyHours(form) != null && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-sm font-semibold text-emerald-800">
                    هذا الدوام يغطي: <strong>{formatHoursMinutes(calcMonthlyHours(form)!)}</strong> عمل شهرياً للموظف الواحد
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">نسخ من جدول موجود</label>
                <select
                  value={copyFromId}
                  onChange={(e) => setCopyFromId(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-base"
                >
                  <option value="">— لا يهم —</option>
                  {list.map((s) => (
                    <option key={s.id} value={s.employee.id}>
                      {s.employee.fullName} ({formatShiftPattern(s.shiftPattern) || (s.workType === 'MORNING' ? 'صباحي' : 'خفر')})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                الموظفون ({selectedEmployeeIds.length} محددين)
              </label>
              <p className="text-xs text-gray-500 mb-2">اختر موظفاً أو عدة موظفين لتطبيق نفس الجدول عليهم</p>
              <div className="relative mb-3">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="بحث بالاسم أو القسم..."
                  className="pr-10 rounded-xl"
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 p-2 space-y-1">
                {employeesLoading && debouncedEmployeeSearch ? (
                  <p className="text-sm text-gray-500 p-4">جاري البحث...</p>
                ) : filteredEmployees.length === 0 ? (
                  <p className="text-sm text-gray-500 p-4">لا توجد نتائج</p>
                ) : (
                  filteredEmployees.map((e) => (
                    <label
                      key={e.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmployeeIds.includes(e.id)}
                        onChange={() => toggleEmployee(e.id)}
                      />
                      <span className="font-medium">{e.fullName}</span>
                      {e.department?.name && (
                        <span className="text-xs text-gray-500">— {e.department.name}</span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-6 border-t mt-6">
            <Button type="submit" disabled={addMutation.isPending || bulkMutation.isPending} className="min-h-[44px]">
              {(addMutation.isPending || bulkMutation.isPending)
                ? 'جاري الحفظ...'
                : selectedEmployeeIds.length > 1
                  ? `تطبيق على ${selectedEmployeeIds.length} موظف`
                  : 'حفظ'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)} className="min-h-[44px]">
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      <Card className="overflow-hidden border-0 shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-16 text-center text-gray-500">حدث خطأ في تحميل البيانات</div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-4">
                <ClipboardList className="h-8 w-8 text-primary-600" />
              </div>
              <p className="text-gray-600 font-medium">لا توجد جداول دوام</p>
              <p className="text-sm text-gray-500 mt-1">اختر السنة والشهر والقسم أو اضغط إضافة لإنشاء جدول</p>
            </div>
          ) : listForView.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Search className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-600 font-medium">لا توجد نتائج تطابق البحث</p>
              <p className="text-sm text-gray-500 mt-1">غيّر كلمة البحث أو امسح الحقل لعرض كل الجداول</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {byDepartment.map(([deptId, { name: deptName, schedules: deptSchedules }]) => {
                const isExpanded = expandedDeptIds.has(deptId);
                const hasPending = deptSchedules.some((s) => (s.status ?? 'PENDING') === 'PENDING');
                const allApproved = deptSchedules.length > 0 && deptSchedules.every((s) => (s.status ?? 'PENDING') === 'APPROVED');
                return (
                  <div key={deptId} className="border-b border-gray-100 last:border-0">
                    <div className="w-full flex items-center justify-between gap-2 p-4">
                      <button
                        type="button"
                        onClick={() => toggleDepartment(deptId)}
                        className="flex-1 flex items-center justify-between gap-4 text-right hover:bg-gray-50/80 transition-colors rounded-lg py-1 min-h-[44px]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-primary-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{deptName}</p>
                            <p className="text-sm text-gray-500">{deptSchedules.length} موظف {allApproved ? '· جدول معتمد' : hasPending ? '· جدول معلق' : ''}</p>
                          </div>
                        </div>
                        <span className="text-gray-400">
                          {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
                        </span>
                      </button>
                      {hasPending && canApproveSchedules && (
                        <Button
                          size="sm"
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700 shrink-0 min-h-[44px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            approveDepartmentMutation.mutate({ year, month, departmentId: deptId });
                          }}
                          disabled={approveDepartmentMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4" /> مصادقة جدول القسم
                        </Button>
                      )}
                    </div>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-gray-50/50 border-t border-gray-100 divide-y divide-gray-100">
                            {deptSchedules.map((s, i) => (
                              <motion.div
                                key={s.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.02 }}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 hover:bg-white/80"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="h-11 w-11 rounded-xl bg-white border border-gray-100 flex items-center justify-center">
                                    <Clock className="h-5 w-5 text-primary-600" />
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-900">{s.employee.fullName}</p>
                                    <p className="text-sm text-gray-400 mt-0.5">
                                      {s.startTime} - {s.endTime}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                      {s.workType === 'SHIFTS' && s.shiftPattern ? (
                                        formatShiftPattern(s.shiftPattern)
                                      ) : (
                                        formatDays(s.daysOfWeek)
                                      )}
                                      {s.cycleStartDate && s.shiftPattern && s.shiftPattern !== 'FIXED' && (
                                        <> — بداية الدورة: {new Date(s.cycleStartDate).toLocaleDateString('ar-EG')}</>
                                      )}
                                    </p>
                                    {(s.status ?? 'PENDING') === 'APPROVED' && s.approvedBy && (
                                      <p className="text-xs text-gray-500 mt-1">مصادق: {s.approvedBy.name}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={(s.status ?? 'PENDING') === 'APPROVED' ? 'success' : 'secondary'}>
                                    {(s.status ?? 'PENDING') === 'APPROVED' ? 'معتمد' : 'معلق'}
                                  </Badge>
                                  <Badge variant={s.workType === 'MORNING' ? 'success' : 'warning'}>
                                    {s.workType === 'MORNING' ? 'صباحي' : 'خفر'}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1 min-h-[44px]"
                                    onClick={() => {
                                      setCopyFromId(s.employee.id);
                                      setSelectedEmployeeIds([s.employee.id]);
                                      setAddOpen(true);
                                    }}
                                    disabled={(s.status ?? 'PENDING') === 'APPROVED' && !canApproveSchedules}
                                    title={(s.status ?? 'PENDING') === 'APPROVED' && !canApproveSchedules ? 'التعديل للمصادق فقط' : undefined}
                                  >
                                    تعديل
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="gap-1 min-h-[44px]"
                                    onClick={() => {
                                      setCopyFromId(s.employee.id);
                                      setSelectedEmployeeIds([]);
                                      setAddOpen(true);
                                    }}
                                  >
                                    <Copy className="h-4 w-4" /> نسخ إعدادات
                                  </Button>
                                  {((s.status ?? 'PENDING') === 'PENDING' || canApproveSchedules) && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 min-h-[44px]"
                                      onClick={() => {
                                        if (typeof window !== 'undefined' && window.confirm('حذف هذا الجدول؟')) {
                                          deleteMutation.mutate(s.id);
                                        }
                                      }}
                                      disabled={deleteMutation.isPending}
                                    >
                                      <Trash2 className="h-4 w-4" /> حذف
                                    </Button>
                                  )}
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
