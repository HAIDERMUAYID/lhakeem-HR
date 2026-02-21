'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  ChevronLeft,
  User,
  Search,
  Filter,
  CalendarDays,
  UserCheck,
  Clock,
  XCircle,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';

type LeaveItem = {
  id: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: string;
  employee: {
    fullName: string;
    jobTitle?: string;
    departmentId?: string;
    department?: { id: string; name: string };
  };
  leaveType: { id: string; nameAr: string };
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

export default function LeaveCalendarPage() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [modalDeptFilter, setModalDeptFilter] = useState('');
  const [modalLeaveTypeFilter, setModalLeaveTypeFilter] = useState('');
  const [modalFiltersOpen, setModalFiltersOpen] = useState(false);
  const debouncedSearch = useDebounce(search.trim(), 300);
  const debouncedModalSearch = useDebounce(modalSearch.trim(), 300);

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['leaves-calendar', date.year, date.month],
    queryFn: () =>
      apiGet<LeaveItem[]>(`/api/leave-requests/calendar?year=${date.year}&month=${date.month}`),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-calendar'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/departments'),
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types-calendar'],
    queryFn: () => apiGet<{ id: string; nameAr: string }[]>('/api/leave-types'),
  });

  const filteredLeaves = useMemo(() => {
    return leaves.filter((l) => {
      if (debouncedSearch) {
        const term = debouncedSearch.toLowerCase();
        const matchName = l.employee.fullName?.toLowerCase().includes(term);
        const matchDept = l.employee.department?.name?.toLowerCase().includes(term);
        const matchTitle = l.employee.jobTitle?.toLowerCase().includes(term);
        const matchLeaveType = l.leaveType.nameAr?.toLowerCase().includes(term);
        if (!matchName && !matchDept && !matchTitle && !matchLeaveType) return false;
      }
      if (statusFilter && l.status !== statusFilter) return false;
      if (departmentFilter && l.employee.departmentId !== departmentFilter) return false;
      if (leaveTypeFilter && l.leaveType.id !== leaveTypeFilter) return false;
      return true;
    });
  }, [leaves, debouncedSearch, statusFilter, departmentFilter, leaveTypeFilter]);

  const daysInMonth = new Date(date.year, date.month, 0).getDate();
  const firstDay = new Date(date.year, date.month - 1, 1).getDay();
  const offset = (firstDay + 1) % 7;

  const getLeavesForDay = (day: number, approvedOnly = false) => {
    const d = new Date(date.year, date.month - 1, day);
    return filteredLeaves.filter((l) => {
      if (approvedOnly && l.status !== 'APPROVED') return false;
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      d.setHours(12, 0, 0, 0);
      return d >= start && d <= end;
    });
  };

  const selectedDayLeaves = selectedDay !== null ? getLeavesForDay(selectedDay, true) : [];

  const filteredModalLeaves = useMemo(() => {
    if (!selectedDayLeaves.length) return [];
    return selectedDayLeaves.filter((l) => {
      if (debouncedModalSearch) {
        const term = debouncedModalSearch.toLowerCase();
        const matchName = l.employee.fullName?.toLowerCase().includes(term);
        const matchDept = l.employee.department?.name?.toLowerCase().includes(term);
        const matchTitle = l.employee.jobTitle?.toLowerCase().includes(term);
        const matchLeaveType = l.leaveType.nameAr?.toLowerCase().includes(term);
        if (!matchName && !matchDept && !matchTitle && !matchLeaveType) return false;
      }
      if (modalDeptFilter && l.employee.departmentId !== modalDeptFilter) return false;
      if (modalLeaveTypeFilter && l.leaveType.id !== modalLeaveTypeFilter) return false;
      return true;
    });
  }, [selectedDayLeaves, debouncedModalSearch, modalDeptFilter, modalLeaveTypeFilter]);

  const modalKpis = useMemo(() => {
    const list = filteredModalLeaves;
    const uniqueDepts = new Set(list.map((l) => l.employee.department?.id).filter(Boolean)).size;
    const uniqueTypes = new Set(list.map((l) => l.leaveType.id)).size;
    return {
      count: list.length,
      departments: uniqueDepts,
      leaveTypes: uniqueTypes,
    };
  }, [filteredModalLeaves]);

  const kpis = useMemo(() => {
    const approved = filteredLeaves.filter((l) => l.status === 'APPROVED');
    const pending = filteredLeaves.filter((l) => l.status === 'PENDING');
    const rejected = filteredLeaves.filter((l) => l.status === 'REJECTED');
    const uniqueEmployees = new Set(approved.map((l) => l.employee.fullName)).size;
    const totalDays = approved.reduce((s, l) => s + l.daysCount, 0);
    return {
      total: filteredLeaves.length,
      approved: approved.length,
      pending: pending.length,
      rejected: rejected.length,
      uniqueOnLeave: uniqueEmployees,
      totalDays,
    };
  }, [filteredLeaves]);

  const prevMonth = () => {
    if (date.month === 1) setDate({ year: date.year - 1, month: 12 });
    else setDate({ year: date.year, month: date.month - 1 });
  };

  const nextMonth = () => {
    if (date.month === 12) setDate({ year: date.year + 1, month: 1 });
    else setDate({ year: date.year, month: date.month + 1 });
  };

  const hasActiveFilters = statusFilter || departmentFilter || leaveTypeFilter || search.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-[1600px] mx-auto"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">تقويم الإجازات</h1>
            <p className="text-gray-500 mt-1">عرض الإجازات شهرياً مع الفلترة والبحث</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth} className="gap-1">
              <ChevronRight className="h-5 w-5" /> السابق
            </Button>
            <span className="font-semibold text-gray-900 min-w-[160px] text-center text-lg">
              {AR_MONTHS[date.month - 1]} {date.year}
            </span>
            <Button variant="outline" size="sm" onClick={nextMonth} className="gap-1">
              التالي <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-0 shadow-md bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center">
                  <CalendarDays className="h-6 w-6 text-slate-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpis.total}</p>
                  <p className="text-sm text-gray-500">إجمالي الطلبات</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <UserCheck className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpis.approved}</p>
                  <p className="text-sm text-gray-500">معتمدة</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpis.pending}</p>
                  <p className="text-sm text-gray-500">قيد الانتظار</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpis.rejected}</p>
                  <p className="text-sm text-gray-500">مرفوضة</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-primary-100 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpis.uniqueOnLeave}</p>
                  <p className="text-sm text-gray-500">موظفين مجازين (فريد)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md bg-white">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <CalendarDays className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpis.totalDays}</p>
                  <p className="text-sm text-gray-500">إجمالي أيام الإجازة</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filters */}
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالاسم، القسم، المسمى الوظيفي أو نوع الإجازة..."
                  className="pr-11 rounded-xl h-11 text-base"
                />
              </div>
              <Button
                variant={filtersOpen ? 'default' : 'outline'}
                size="default"
                className="gap-2 h-11 shrink-0"
                onClick={() => setFiltersOpen((o) => !o)}
              >
                <Filter className="h-5 w-5" />
                الفلاتر
                {hasActiveFilters && (
                  <Badge variant="secondary" className="mr-1">
                    {[statusFilter, departmentFilter, leaveTypeFilter].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>
            {filtersOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">الحالة</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full h-11 rounded-xl border border-gray-200 bg-white px-4 text-base"
                  >
                    <option value="">الكل</option>
                    <option value="APPROVED">معتمدة</option>
                    <option value="PENDING">قيد الانتظار</option>
                    <option value="REJECTED">مرفوضة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">القسم</label>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full h-11 rounded-xl border border-gray-200 bg-white px-4 text-base"
                  >
                    <option value="">الكل</option>
                    {(departments as { id: string; name: string }[]).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">نوع الإجازة</label>
                  <select
                    value={leaveTypeFilter}
                    onChange={(e) => setLeaveTypeFilter(e.target.value)}
                    className="w-full h-11 rounded-xl border border-gray-200 bg-white px-4 text-base"
                  >
                    <option value="">الكل</option>
                    {(leaveTypes as { id: string; nameAr: string }[]).map((lt) => (
                      <option key={lt.id} value={lt.id}>{lt.nameAr}</option>
                    ))}
                  </select>
                </div>
                {hasActiveFilters && (
                  <div className="sm:col-span-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStatusFilter('');
                        setDepartmentFilter('');
                        setLeaveTypeFilter('');
                        setSearch('');
                      }}
                    >
                      مسح الفلاتر
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calendar - larger */}
      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-6">
          <div className="grid grid-cols-7 gap-2 text-center text-sm font-semibold text-gray-600 mb-3">
            {WEEKDAYS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: offset }, (_, i) => (
              <div key={`empty-${i}`} className="min-h-[110px] bg-gray-50/80 rounded-xl" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayLeavesAll = getLeavesForDay(day);
              const dayLeavesApproved = getLeavesForDay(day, true);
              const count = dayLeavesApproved.length;
              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === date.month - 1 &&
                new Date().getFullYear() === date.year;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`min-h-[110px] p-3 rounded-xl border text-right transition-all ${
                    isToday
                      ? 'border-primary-500 bg-primary-50/60 ring-2 ring-primary-200'
                      : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
                  } ${count > 0 ? 'cursor-pointer' : ''}`}
                >
                  <div className="text-base font-semibold text-gray-800 mb-2">{day}</div>
                  {count > 0 ? (
                    <div className="text-sm font-semibold text-primary-700 bg-primary-100 rounded-lg px-2 py-1.5 inline-block">
                      {count} {count === 1 ? 'مجاز' : 'مجازين'}
                    </div>
                  ) : (
                    <div className="space-y-1 overflow-hidden">
                      {dayLeavesAll.slice(0, 2).map((l) => (
                        <div
                          key={l.id}
                          className={`text-xs px-1.5 py-0.5 rounded truncate ${STATUS_COLORS[l.status] || 'bg-gray-100'}`}
                          title={`${l.employee.fullName} - ${l.leaveType.nameAr}`}
                        >
                          {l.employee.fullName}
                        </div>
                      ))}
                      {dayLeavesAll.length > 2 && (
                        <div className="text-xs text-gray-500">+{dayLeavesAll.length - 2}</div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day detail modal - with search, filters & KPIs */}
      <Modal
        open={selectedDay !== null}
        onClose={() => {
          setSelectedDay(null);
          setModalSearch('');
          setModalDeptFilter('');
          setModalLeaveTypeFilter('');
          setModalFiltersOpen(false);
        }}
        title={
          selectedDay !== null
            ? `الموظفون المجازون — ${selectedDay} ${AR_MONTHS[date.month - 1]} ${date.year}`
            : ''
        }
        className="max-w-3xl"
      >
        {selectedDay !== null && (
          <div className="space-y-4">
            {selectedDayLeaves.length === 0 ? (
              <p className="text-gray-500 py-8 text-center">لا يوجد موظفون مجازون في هذا اليوم</p>
            ) : (
              <>
                {/* Search & Filters inside modal */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        value={modalSearch}
                        onChange={(e) => setModalSearch(e.target.value)}
                        placeholder="بحث بالاسم، القسم، المسمى أو نوع الإجازة..."
                        className="pr-10 rounded-lg h-10 text-sm"
                      />
                    </div>
                    <Button
                      variant={modalFiltersOpen ? 'default' : 'outline'}
                      size="sm"
                      className="gap-1.5 h-10 shrink-0"
                      onClick={() => setModalFiltersOpen((o) => !o)}
                    >
                      <Filter className="h-4 w-4" />
                      الفلاتر
                      {(modalDeptFilter || modalLeaveTypeFilter) && (
                        <Badge variant="secondary" className="mr-0.5 text-xs">
                          {[modalDeptFilter, modalLeaveTypeFilter].filter(Boolean).length}
                        </Badge>
                      )}
                    </Button>
                  </div>
                  {modalFiltersOpen && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">القسم</label>
                        <select
                          value={modalDeptFilter}
                          onChange={(e) => setModalDeptFilter(e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                        >
                          <option value="">الكل</option>
                          {(departments as { id: string; name: string }[]).map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">نوع الإجازة</label>
                        <select
                          value={modalLeaveTypeFilter}
                          onChange={(e) => setModalLeaveTypeFilter(e.target.value)}
                          className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm"
                        >
                          <option value="">الكل</option>
                          {(leaveTypes as { id: string; nameAr: string }[]).map((lt) => (
                            <option key={lt.id} value={lt.id}>{lt.nameAr}</option>
                          ))}
                        </select>
                      </div>
                      {(modalDeptFilter || modalLeaveTypeFilter) && (
                        <div className="sm:col-span-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-sm"
                            onClick={() => {
                              setModalDeptFilter('');
                              setModalLeaveTypeFilter('');
                            }}
                          >
                            مسح الفلاتر
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* KPIs for this day (filtered) */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-primary-50 border border-primary-100 p-3 text-center">
                    <p className="text-2xl font-bold text-primary-700">{modalKpis.count}</p>
                    <p className="text-xs text-primary-600 mt-0.5">موظف مجاز</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-700">{modalKpis.departments}</p>
                    <p className="text-xs text-slate-600 mt-0.5">قسم</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{modalKpis.leaveTypes}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">نوع إجازة</p>
                  </div>
                </div>

                {/* List (filtered) */}
                {filteredModalLeaves.length === 0 ? (
                  <p className="text-gray-500 py-6 text-center text-sm">لا توجد نتائج تطابق البحث أو الفلاتر</p>
                ) : (
                  <ul className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
                    {filteredModalLeaves.map((l) => (
                      <li key={l.id} className="flex items-center gap-4 py-4 first:pt-0">
                        <div className="h-12 w-12 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                          <User className="h-6 w-6 text-primary-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900">{l.employee.fullName}</p>
                          <p className="text-sm text-gray-600 mt-0.5">
                            {l.employee.jobTitle ?? '—'}
                            {l.employee.department?.name ? ` • ${l.employee.department.name}` : ''}
                          </p>
                          <Badge className={`mt-1.5 ${STATUS_COLORS[l.status] || 'bg-gray-100'}`}>{l.leaveType.nameAr}</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* List by month - with filters applied */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4 text-lg">الإجازات في الشهر {hasActiveFilters && '(بعد الفلترة)'}</h3>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            </div>
          ) : filteredLeaves.length === 0 ? (
            <p className="text-gray-500 py-8 text-center">لا توجد إجازات تطابق البحث أو الفلاتر</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredLeaves.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-gray-50 hover:bg-gray-100"
                >
                  <div>
                    <p className="font-medium text-gray-900">{l.employee.fullName}</p>
                    <p className="text-sm text-gray-500">
                      {l.leaveType.nameAr}
                      {l.employee.department?.name ? ` • ${l.employee.department.name}` : ''} —{' '}
                      {new Date(l.startDate).toLocaleDateString('ar-EG')} -{' '}
                      {new Date(l.endDate).toLocaleDateString('ar-EG')} ({l.daysCount} أيام)
                    </p>
                  </div>
                  <Badge className={STATUS_COLORS[l.status]}>
                    {l.status === 'PENDING' ? 'قيد الانتظار' : l.status === 'APPROVED' ? 'معتمدة' : 'مرفوضة'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
