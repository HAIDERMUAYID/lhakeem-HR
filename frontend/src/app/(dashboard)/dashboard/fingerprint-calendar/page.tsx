'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  ChevronLeft,
  Fingerprint,
  CalendarDays,
  Search,
  UserCheck,
  UserX,
  Clock,
  Coffee,
  AlertTriangle,
  Users,
  LayoutGrid,
  Calendar,
} from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';

const STORAGE_DEVICE_KEY = 'fingerprint-calendar-device';

type DeviceOption = { id: string; name: string; code: string | null; location: string | null };
type DayRow = { date: string; onDuty: number; onLeave: number; noSchedule: number; absent: number };
type MonthResponse = { year: number; month: number; deviceId: string | null; days: DayRow[] };

type DayEmployee = {
  employeeId: string;
  fullName: string;
  jobTitle: string;
  departmentName: string;
  deviceName: string;
  fingerprintId: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  status: 'ON_DUTY' | 'ON_LEAVE' | 'NO_SCHEDULE' | 'ABSENT' | 'BREAK';
};
type DayDetailResponse = {
  date: string;
  device: { id: string; name: string; code: string | null; location: string | null };
  employees: DayEmployee[];
} | null;

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

/** من ليس لديه دوام اليوم يُسجّل استراحة — NO_SCHEDULE و BREAK يعرضان كـ "استراحة" */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ON_DUTY: { label: 'لديه دوام', className: 'bg-emerald-100 text-emerald-800' },
  ON_LEAVE: { label: 'مجاز', className: 'bg-sky-100 text-sky-800' },
  NO_SCHEDULE: { label: 'استراحة', className: 'bg-violet-100 text-violet-800' },
  ABSENT: { label: 'لم يحضر', className: 'bg-amber-100 text-amber-800' },
  BREAK: { label: 'استراحة', className: 'bg-violet-100 text-violet-800' },
};

function getNowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function FingerprintCalendarPage() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [deviceId, setDeviceIdState] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [workType, setWorkType] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [dayStatusFilter, setDayStatusFilter] = useState<string>('');
  const [dayModalSearch, setDayModalSearch] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_DEVICE_KEY);
      if (saved) setDeviceIdState(saved);
    }
  }, []);

  const setDeviceId = (id: string) => {
    setDeviceIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_DEVICE_KEY, id);
  };

  const { data: devices = [] } = useQuery({
    queryKey: ['devices-list'],
    queryFn: () => apiGet<DeviceOption[]>('/api/devices?activeOnly=true'),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-options'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/departments'),
  });

  const { data: monthData, isLoading } = useQuery({
    queryKey: ['fingerprint-calendar-month', deviceId, date.year, date.month, departmentId, workType, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({
        deviceId,
        year: String(date.year),
        month: String(date.month),
      });
      if (departmentId) params.set('departmentId', departmentId);
      if (workType) params.set('workType', workType);
      if (debouncedSearch) params.set('search', debouncedSearch);
      return apiGet<MonthResponse>(`/api/fingerprint-calendar/month?${params}`);
    },
    enabled: !!deviceId,
  });

  const { data: dayDetail, isLoading: dayLoading } = useQuery({
    queryKey: ['fingerprint-calendar-day', deviceId, selectedDate, departmentId],
    queryFn: () => {
      const params = new URLSearchParams({ deviceId, date: selectedDate! });
      if (departmentId) params.set('departmentId', departmentId);
      const today = new Date().toISOString().slice(0, 10);
      if (selectedDate === today) params.set('time', getNowTime());
      return apiGet<DayDetailResponse>(`/api/fingerprint-calendar/day?${params}`);
    },
    enabled: !!deviceId && !!selectedDate,
  });

  const days = monthData?.days ?? [];
  const daysInMonth = new Date(date.year, date.month, 0).getDate();
  const firstDay = new Date(date.year, date.month - 1, 1).getDay();
  const offset = (firstDay + 1) % 7;

  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const monthKpis = useMemo(() => {
    let onDuty = 0; let onLeave = 0; let noSchedule = 0; let absent = 0;
    days.forEach((row) => {
      onDuty += row.onDuty; onLeave += row.onLeave; noSchedule += row.noSchedule; absent += row.absent;
    });
    return { onDuty, onLeave, noSchedule, absent };
  }, [days]);

  const getDayData = (day: number): DayRow | undefined => {
    const dateStr = `${date.year}-${String(date.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return days.find((d) => d.date === dateStr);
  };

  const isToday = (day: number) => {
    const dateStr = `${date.year}-${String(date.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr === todayStr;
  };

  const prevMonth = () => {
    if (date.month === 1) setDate({ year: date.year - 1, month: 12 });
    else setDate({ year: date.year, month: date.month - 1 });
  };

  const nextMonth = () => {
    if (date.month === 12) setDate({ year: date.year + 1, month: 1 });
    else setDate({ year: date.year, month: date.month + 1 });
  };

  const goToMonth = (month: number) => {
    setDate((prev) => ({ ...prev, month }));
    setViewMode('month');
  };

  const deviceOptions = devices.map((d) => ({
    value: d.id,
    label: [d.name, d.location].filter(Boolean).join(' — ') || d.id,
  }));
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));

  const filteredDayEmployees = useMemo(() => {
    let list = dayDetail?.employees ?? [];
    if (dayStatusFilter === 'REST') {
      list = list.filter((e) => e.status === 'BREAK' || e.status === 'NO_SCHEDULE');
    } else if (dayStatusFilter) {
      list = list.filter((e) => e.status === dayStatusFilter);
    }
    const q = dayModalSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        (e.jobTitle ?? '').toLowerCase().includes(q) ||
        (e.departmentName ?? '').toLowerCase().includes(q)
    );
  }, [dayDetail?.employees, dayStatusFilter, dayModalSearch]);

  const monitorNow = useMemo(() => {
    const list = dayDetail?.employees ?? [];
    return {
      onDuty: list.filter((e) => e.status === 'ON_DUTY'),
      onBreak: list.filter((e) => e.status === 'BREAK' || e.status === 'NO_SCHEDULE'),
      absent: list.filter((e) => e.status === 'ABSENT'),
    };
  }, [dayDetail?.employees]);

  const dayKpis = useMemo(() => {
    const list = dayDetail?.employees ?? [];
    return {
      total: list.length,
      onDuty: list.filter((e) => e.status === 'ON_DUTY').length,
      rest: list.filter((e) => e.status === 'BREAK' || e.status === 'NO_SCHEDULE').length,
      onLeave: list.filter((e) => e.status === 'ON_LEAVE').length,
      absent: list.filter((e) => e.status === 'ABSENT').length,
    };
  }, [dayDetail?.employees]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-[1400px] mx-auto"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">تقويم وحدة البصمة</h1>
            <p className="text-gray-500 mt-1">
              المرجع اليومي لموظف البصمة: من لديه دوام، من مجاز، من في استراحة، ومن يجب مراقبته
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[220px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">جهاز البصمة *</label>
                <Select
                  value={deviceId}
                  onChange={setDeviceId}
                  options={[{ value: '', label: '— اختر الجهاز —' }, ...deviceOptions]}
                  placeholder="اختر الجهاز"
                />
              </div>
              <div className="min-w-[160px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">القسم</label>
                <Select
                  value={departmentId}
                  onChange={setDepartmentId}
                  options={[{ value: '', label: 'الكل' }, ...departmentOptions]}
                  placeholder="الكل"
                />
              </div>
              <div className="min-w-[140px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">نوع الدوام</label>
                <Select
                  value={workType}
                  onChange={setWorkType}
                  options={[
                    { value: '', label: 'الكل' },
                    { value: 'MORNING', label: 'صباحي' },
                    { value: 'SHIFTS', label: 'خفارات' },
                  ]}
                />
              </div>
              <div className="min-w-[200px]">
                <label className="block text-xs font-medium text-gray-500 mb-1">بحث بالاسم</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="اسم الموظف..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-9"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {!deviceId ? (
          <EmptyState
            icon={Fingerprint}
            title="اختر جهاز بصمة"
            description="اختر جهازاً من القائمة أعلاه لعرض تقويم الموظفين المرتبطين به"
          />
        ) : (
          <>
            {/* Month KPIs */}
            {monthData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="border-0 shadow-md">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <UserCheck className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{monthKpis.onDuty}</p>
                      <p className="text-xs text-gray-500">إجمالي دوام (الشهر)</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-sky-100 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{monthKpis.onLeave}</p>
                      <p className="text-xs text-gray-500">مجاز</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-gray-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{monthKpis.noSchedule}</p>
                      <p className="text-xs text-gray-500">لا دوام</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-amber-100 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-gray-900">{monthKpis.absent}</p>
                      <p className="text-xs text-gray-500">غياب</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === 'month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('month')}
                  className="gap-1"
                >
                  <CalendarDays className="h-4 w-4" />
                  شهر
                </Button>
                <Button
                  variant={viewMode === 'year' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('year')}
                  className="gap-1"
                >
                  <LayoutGrid className="h-4 w-4" />
                  سنة
                </Button>
                {viewMode === 'month' && (
                  <>
                    <Button variant="outline" size="sm" onClick={prevMonth} className="gap-1">
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                    <span className="font-semibold text-gray-900 min-w-[180px] text-center text-lg">
                      {AR_MONTHS[date.month - 1]} {date.year}
                    </span>
                    <Button variant="outline" size="sm" onClick={nextMonth} className="gap-1">
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-emerald-500" title="لديه دوام" /> دوام</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-sky-500" title="مجاز" /> مجاز</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-violet-500" title="استراحة / لا دوام" /> استراحة</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-amber-500" title="لم يحضر" /> غياب</span>
              </div>
            </div>

            {viewMode === 'year' ? (
              <Card className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-4">
                  <p className="text-center text-gray-600 mb-4">اختر الشهر لعرض التقويم</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {AR_MONTHS.map((name, i) => (
                      <Button
                        key={name}
                        variant="outline"
                        className="h-auto py-3"
                        onClick={() => goToMonth(i + 1)}
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-4">
                  {isLoading ? (
                    <div className="grid grid-cols-7 gap-1 min-h-[400px]">
                      {WEEKDAYS.map((w) => (
                        <div key={w} className="text-center text-xs text-gray-400 py-2">{w}</div>
                      ))}
                      {Array.from({ length: 35 }, (_, i) => (
                        <div key={i} className="min-h-[70px] rounded-xl bg-gray-100 animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-1">
                      {WEEKDAYS.map((w) => (
                        <div key={w} className="text-center text-xs font-medium text-gray-500 py-2">
                          {w}
                        </div>
                      ))}
                      {Array.from({ length: offset }, (_, i) => (
                        <div key={`empty-${i}`} className="min-h-[82px] rounded-xl bg-gray-50/50" />
                      ))}
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const row = getDayData(day);
                        const dateStr = `${date.year}-${String(date.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const isSelected = selectedDate === dateStr;
                        const today = isToday(day);
                        const total = row ? row.onDuty + row.onLeave + row.noSchedule + row.absent : 0;
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setSelectedDate(dateStr)}
                            className={`min-h-[82px] rounded-xl border-2 text-right p-2 transition-all hover:border-primary-300 hover:bg-primary-50/30 ${
                              today ? 'ring-2 ring-primary-400 ring-offset-2' : ''
                            } ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-100 bg-white'}`}
                          >
                            <span className={`block text-sm font-semibold ${today ? 'text-primary-600' : 'text-gray-900'}`}>
                              {day} {today && <span className="text-xs text-primary-500">(اليوم)</span>}
                            </span>
                            {row && total > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1 justify-end">
                                {row.onDuty > 0 && (
                                  <span className="inline-flex items-center rounded-md bg-emerald-500 text-white text-xs font-medium px-1.5 py-0.5" title="لديه دوام">{row.onDuty}</span>
                                )}
                                {row.onLeave > 0 && (
                                  <span className="inline-flex items-center rounded-md bg-sky-500 text-white text-xs font-medium px-1.5 py-0.5" title="مجاز">{row.onLeave}</span>
                                )}
                                {row.noSchedule > 0 && (
                                  <span className="inline-flex items-center rounded-md bg-violet-500 text-white text-xs font-medium px-1.5 py-0.5" title="استراحة / لا دوام">{row.noSchedule}</span>
                                )}
                                {row.absent > 0 && (
                                  <span className="inline-flex items-center rounded-md bg-amber-500 text-white text-xs font-medium px-1.5 py-0.5" title="لم يحضر">{row.absent}</span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Day detail modal */}
      <Modal
        open={!!selectedDate}
        onClose={() => {
          setSelectedDate(null);
          setDayModalSearch('');
        }}
        title={dayDetail ? `تفاصيل ${selectedDate} — ${dayDetail.device.name}` : 'تفاصيل اليوم'}
        className="max-w-4xl max-h-[90vh] flex flex-col"
      >
        {dayLoading ? (
          <div className="py-12 flex justify-center"><div className="h-8 w-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" /></div>
        ) : dayDetail?.employees?.length === 0 ? (
          <div className="py-12 text-center text-gray-500">لا يوجد موظفين بعد تطبيق الفلاتر.</div>
        ) : dayDetail ? (
          <>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="بحث بالاسم أو الوظيفة أو القسم..."
                  value={dayModalSearch}
                  onChange={(e) => setDayModalSearch(e.target.value)}
                  className="pr-10 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{dayKpis.total}</p>
                  <p className="text-xs text-gray-500">الإجمالي</p>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{dayKpis.onDuty}</p>
                  <p className="text-xs text-gray-500">لديه دوام</p>
                </div>
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50/80 p-3 flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <Coffee className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{dayKpis.rest}</p>
                  <p className="text-xs text-gray-500">استراحة</p>
                </div>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/80 p-3 flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4 text-sky-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{dayKpis.onLeave}</p>
                  <p className="text-xs text-gray-500">مجاز</p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-3 flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <UserX className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{dayKpis.absent}</p>
                  <p className="text-xs text-gray-500">لم يحضر</p>
                </div>
              </div>
            </div>

            {selectedDate === todayStr && (monitorNow.onDuty.length > 0 || monitorNow.onBreak.length > 0 || monitorNow.absent.length > 0) && (
              <div className="mb-4 p-4 rounded-xl bg-primary-50 border border-primary-100 space-y-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary-600" />
                  من يجب مراقبته الآن
                </h3>
                <div className="flex flex-wrap gap-3">
                  {monitorNow.onDuty.length > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-800 gap-1">
                      <UserCheck className="h-3.5 w-3.5" /> دوام ({monitorNow.onDuty.length})
                    </Badge>
                  )}
                  {monitorNow.onBreak.length > 0 && (
                    <Badge className="bg-violet-100 text-violet-800 gap-1">
                      <Coffee className="h-3.5 w-3.5" /> استراحة ({monitorNow.onBreak.length})
                    </Badge>
                  )}
                  {monitorNow.absent.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-800 gap-1">
                      <UserX className="h-3.5 w-3.5" /> لم يحضر ({monitorNow.absent.length})
                    </Badge>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-3">
              <Button
                variant={!dayStatusFilter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDayStatusFilter('')}
              >
                الكل
              </Button>
              <Button
                variant={dayStatusFilter === 'ON_DUTY' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDayStatusFilter(dayStatusFilter === 'ON_DUTY' ? '' : 'ON_DUTY')}
              >
                لديه دوام
              </Button>
              <Button
                variant={dayStatusFilter === 'REST' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDayStatusFilter(dayStatusFilter === 'REST' ? '' : 'REST')}
              >
                استراحة
              </Button>
              <Button
                variant={dayStatusFilter === 'ON_LEAVE' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDayStatusFilter(dayStatusFilter === 'ON_LEAVE' ? '' : 'ON_LEAVE')}
              >
                مجاز
              </Button>
            </div>

            <div className="overflow-auto flex-1 min-h-0 border rounded-xl">
              {filteredDayEmployees.length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  لا توجد نتائج {dayModalSearch.trim() || dayStatusFilter ? '— جرّب تغيير البحث أو الفلتر' : ''}
                </div>
              ) : (
              <table className="w-full text-right">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="p-3 text-sm font-medium text-gray-600">الموظف</th>
                    <th className="p-3 text-sm font-medium text-gray-600">القسم</th>
                    <th className="p-3 text-sm font-medium text-gray-600">بداية / نهاية</th>
                    <th className="p-3 text-sm font-medium text-gray-600">الاستراحة</th>
                    <th className="p-3 text-sm font-medium text-gray-600">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDayEmployees.map((emp) => {
                    const statusInfo = STATUS_LABELS[emp.status] ?? { label: emp.status, className: 'bg-gray-100' };
                    return (
                      <tr key={emp.employeeId} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="p-3">
                          <p className="font-medium text-gray-900">{emp.fullName}</p>
                          <p className="text-xs text-gray-500">{emp.jobTitle}</p>
                        </td>
                        <td className="p-3 text-gray-600">{emp.departmentName}</td>
                        <td className="p-3 text-gray-600">{emp.startTime} — {emp.endTime}</td>
                        <td className="p-3 text-gray-600">
                          {emp.breakStart && emp.breakEnd ? `${emp.breakStart} - ${emp.breakEnd}` : '—'}
                        </td>
                        <td className="p-3">
                          <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
            </div>
            <div className="flex justify-end pt-4 border-t border-gray-100 mt-4">
              <Button variant="outline" onClick={() => setSelectedDate(null)}>إغلاق</Button>
            </div>
          </>
        ) : null}
      </Modal>
    </motion.div>
  );
}
