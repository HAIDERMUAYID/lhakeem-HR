'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Search,
  Filter,
  CheckCircle2,
  Undo2,
  User,
  FileText,
  Building2,
  Users,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableSkeleton } from '@/components/shared/page-skeleton';
import { useDebounce } from '@/hooks/use-debounce';

type Absence = {
  id: string;
  date: string;
  status: string;
  employee: {
    id: string;
    fullName: string;
    jobTitle?: string;
    workType: string;
    department?: { id: string; name: string };
  };
};

type AbsenceReport = {
  id: string;
  reportDate: string;
  status: string;
  createdBy?: { id: string; name: string };
  absences: Absence[];
};

const WORK_TYPE_LABEL: Record<string, string> = {
  MORNING: 'صباحي',
  SHIFTS: 'خِفارات',
};

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AbsencesDayPage() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const today = toDateString(new Date());
  const selectedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [senderFilter, setSenderFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [unapproveOpen, setUnapproveOpen] = useState(false);
  const [isManager, setIsManager] = useState(false);

  const debouncedSearch = useDebounce(search.trim(), 300);
  const queryClient = useQueryClient();

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        const p = JSON.parse(u)?.permissions ?? [];
        setIsManager(p.includes('ADMIN') || p.includes('FINGERPRINT_MANAGER'));
      } catch {
        setIsManager(false);
      }
    }
  }, []);

  const { data: reportsByDate = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['absence-reports-by-date', selectedDate],
    queryFn: () =>
      apiGet<AbsenceReport[]>(`/api/absence-reports/by-date?date=${selectedDate}`),
    enabled: !!selectedDate,
  });

  const { data: dateLocked } = useQuery({
    queryKey: ['absence-date-locked', selectedDate],
    queryFn: () => apiGet<boolean>(`/api/absence-reports/date-locked?date=${selectedDate}`),
    enabled: !!selectedDate,
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      apiPost('/api/absence-reports/consolidation/approve', { date: selectedDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absence-reports-by-date', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-date-locked', selectedDate] });
      toast.success('تمت مصادقة الكشف اليومي');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unapproveMutation = useMutation({
    mutationFn: () =>
      apiPost('/api/absence-reports/consolidation/unapprove', { date: selectedDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absence-reports-by-date', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-date-locked', selectedDate] });
      setUnapproveOpen(false);
      toast.success('تم إلغاء المصادقة');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submittedReports = useMemo(
    () => reportsByDate.filter((r) => r.status === 'SUBMITTED'),
    [reportsByDate]
  );

  const allAbsencesWithReport = useMemo(() => {
    const list: { absence: Absence; report: AbsenceReport }[] = [];
    submittedReports.forEach((r) => {
      (r.absences ?? []).forEach((a) => list.push({ absence: a, report: r }));
    });
    return list;
  }, [submittedReports]);

  const departments = useMemo(() => {
    const set = new Map<string, string>();
    allAbsencesWithReport.forEach(({ absence }) => {
      const d = absence.employee?.department;
      if (d?.id) set.set(d.id, d.name ?? d.id);
    });
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [allAbsencesWithReport]);

  const senders = useMemo(() => {
    const unique = Array.from(
      new Map(submittedReports.map((r) => [r.createdBy?.id ?? r.id, r.createdBy?.name ?? '—'])).entries()
    ).map(([id, name]) => ({ id, name }));
    return unique;
  }, [submittedReports]);

  const filteredRows = useMemo(() => {
    return allAbsencesWithReport.filter(({ absence }) => {
      if (debouncedSearch) {
        const term = debouncedSearch.toLowerCase();
        const matchName = absence.employee?.fullName?.toLowerCase().includes(term);
        const matchDept = absence.employee?.department?.name?.toLowerCase().includes(term);
        const matchTitle = absence.employee?.jobTitle?.toLowerCase().includes(term);
        if (!matchName && !matchDept && !matchTitle) return false;
      }
      if (deptFilter && absence.employee?.department?.id !== deptFilter) return false;
      return true;
    }).filter(({ report }) => {
      if (!senderFilter) return true;
      return (report.createdBy?.id ?? report.id) === senderFilter;
    });
  }, [allAbsencesWithReport, debouncedSearch, deptFilter, senderFilter]);

  const kpis = useMemo(() => {
    const uniqueEmployees = new Set(filteredRows.map(({ absence }) => absence.employee?.id).filter(Boolean)).size;
    const uniqueDepts = new Set(filteredRows.map(({ absence }) => absence.employee?.department?.id).filter(Boolean)).size;
    return {
      reportsCount: submittedReports.length,
      totalAbsences: allAbsencesWithReport.length,
      filteredCount: filteredRows.length,
      uniqueEmployees,
      uniqueDepts,
    };
  }, [submittedReports.length, allAbsencesWithReport.length, filteredRows, filteredRows.length]);

  const isLocked = dateLocked === true;
  const canApprove = isManager && submittedReports.length > 0 && !isLocked;

  const { data: duplicatesData } = useQuery({
    queryKey: ['absence-duplicates', selectedDate],
    queryFn: () =>
      apiGet<{ duplicates: { employeeId: string; fullName: string; reports: { reportId: string; reportCreatorName: string }[] }[] }>(
        `/api/absence-reports/consolidation/duplicates?date=${selectedDate}`
      ),
    enabled: canApprove && !!selectedDate,
  });
  const duplicates = duplicatesData?.duplicates ?? [];
  const hasDuplicates = duplicates.length > 0;

  const [resolveDuplicateOpen, setResolveDuplicateOpen] = useState(false);
  const resolveDuplicateMutation = useMutation({
    mutationFn: async () => {
      for (const dup of duplicates) {
        await apiPost<{ removed: number }>('/api/absence-reports/consolidation/resolve-duplicate', {
          date: selectedDate,
          employeeId: dup.employeeId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absence-reports-by-date', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-duplicates', selectedDate] });
      setResolveDuplicateOpen(false);
      toast.success('تمت إزالة التكرار. يمكنك الآن مصادقة الكشف اليومي.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dateFormatted = new Date(selectedDate + 'T12:00:00').toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const hasActiveFilters = deptFilter || senderFilter || search.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-gradient-to-b from-slate-50 to-white"
    >
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <Link
            href="/dashboard/absences"
            className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium w-fit"
          >
            <ArrowRight className="h-4 w-4" />
            العودة إلى الغيابات
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                الكشوف المرسلة لهذا اليوم
              </h1>
              <p className="mt-1 text-lg text-gray-600 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-400" />
                {dateFormatted}
              </p>
            </div>
            {isLocked && isManager && (
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  تمت المصادقة
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                  onClick={() => setUnapproveOpen(true)}
                  disabled={unapproveMutation.isPending}
                >
                  <Undo2 className="h-4 w-4" />
                  إلغاء المصادقة
                </Button>
              </div>
            )}
          </div>
        </div>

        {reportsLoading ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-8">
              <TableSkeleton rows={8} />
            </CardContent>
          </Card>
        ) : submittedReports.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="py-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-slate-500" />
              </div>
              <p className="text-gray-700 font-medium text-lg">لا توجد كشوف مرسلة لهذا اليوم</p>
              <p className="text-gray-500 mt-1">سيظهر هنا الكشوف بعد إرسالها من موظفي البصمة</p>
              <Button asChild variant="outline" className="mt-6 gap-2">
                <Link href="/dashboard/absences">
                  <ArrowRight className="h-4 w-4" />
                  العودة إلى الغيابات
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 bg-primary-500 text-white">
                    <FileText className="h-8 w-8 opacity-90 mb-2" />
                    <p className="text-3xl font-bold">{kpis.reportsCount}</p>
                    <p className="text-sm opacity-90 mt-0.5">كشف مرسل</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 bg-slate-600 text-white">
                    <Users className="h-8 w-8 opacity-90 mb-2" />
                    <p className="text-3xl font-bold">{kpis.totalAbsences}</p>
                    <p className="text-sm opacity-90 mt-0.5">إجمالي السجلات</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 bg-emerald-600 text-white">
                    <User className="h-8 w-8 opacity-90 mb-2" />
                    <p className="text-3xl font-bold">{kpis.uniqueEmployees}</p>
                    <p className="text-sm opacity-90 mt-0.5">موظف غائب (فريد)</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 bg-violet-600 text-white">
                    <Building2 className="h-8 w-8 opacity-90 mb-2" />
                    <p className="text-3xl font-bold">{kpis.uniqueDepts}</p>
                    <p className="text-sm opacity-90 mt-0.5">قسم</p>
                  </div>
                </CardContent>
              </Card>
              {hasActiveFilters && (
                <Card className="border-0 shadow-md border-primary-200 bg-primary-50/50">
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-primary-700">{filteredRows.length}</p>
                    <p className="text-sm text-primary-600 mt-0.5">بعد البحث والفلترة</p>
                  </CardContent>
                </Card>
              )}
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
                      placeholder="بحث بالاسم، القسم أو المسمى الوظيفي..."
                      className="pr-11 rounded-xl h-12 text-base"
                    />
                  </div>
                  <Button
                    variant={filtersOpen ? 'default' : 'outline'}
                    size="default"
                    className="gap-2 h-12 shrink-0"
                    onClick={() => setFiltersOpen((o) => !o)}
                  >
                    <Filter className="h-5 w-5" />
                    الفلاتر
                    {(deptFilter || senderFilter) && (
                      <Badge variant="secondary" className="mr-1">
                        {[deptFilter, senderFilter].filter(Boolean).length}
                      </Badge>
                    )}
                  </Button>
                </div>
                {filtersOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">القسم</label>
                      <select
                        value={deptFilter}
                        onChange={(e) => setDeptFilter(e.target.value)}
                        className="w-full h-11 rounded-xl border border-gray-200 bg-white px-4 text-base"
                      >
                        <option value="">الكل</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">المرسل</label>
                      <select
                        value={senderFilter}
                        onChange={(e) => setSenderFilter(e.target.value)}
                        className="w-full h-11 rounded-xl border border-gray-200 bg-white px-4 text-base"
                      >
                        <option value="">الكل</option>
                        {senders.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    {(deptFilter || senderFilter) && (
                      <div className="sm:col-span-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setDeptFilter(''); setSenderFilter(''); }}
                        >
                          مسح الفلاتر
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {hasDuplicates && (
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 mb-4">
                <p className="font-medium text-amber-900 mb-2">تنبيه: وجود تكرار في الكشوف المرسلة</p>
                <ul className="list-none space-y-2 text-sm text-amber-800 mb-4">
                  {duplicates.map((dup) => {
                    const reportsText = dup.reports.map((r) => `كشف ${r.reportCreatorName}`).join(' ومرة في ');
                    return (
                      <li key={dup.employeeId}>
                        <strong>{dup.fullName}</strong> مكرر {dup.reports.length} مرات: مرة في {reportsText}.
                      </li>
                    );
                  })}
                </ul>
                <p className="text-amber-800 mb-3">هل تريد حذف التكرار من أحد الكشوف والإبقاء على تسجيل واحد لكل موظف ثم المتابعة؟</p>
                <Button
                  onClick={() => setResolveDuplicateOpen(true)}
                  disabled={resolveDuplicateMutation.isPending}
                  className="gap-2 bg-amber-600 hover:bg-amber-700"
                >
                  {resolveDuplicateMutation.isPending ? 'جاري إزالة التكرار...' : 'إزالة التكرار والمتابعة'}
                </Button>
              </div>
            )}

            <ConfirmDialog
              open={resolveDuplicateOpen}
              onOpenChange={setResolveDuplicateOpen}
              title="إزالة التكرار"
              description="سيتم الإبقاء على سجل غياب واحد لكل موظف مكرر وحذف التكرار من الكشوف الأخرى. بعد ذلك يمكنك مصادقة الكشف اليومي."
              confirmLabel="نعم، إزالة التكرار"
              variant="default"
              onConfirm={() => resolveDuplicateMutation.mutate()}
            />

            {/* Table */}
            <Card className="border-0 shadow-lg overflow-hidden">
              <CardHeader className="border-b border-gray-100 bg-gray-50/50">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-gray-900">تفاصيل الغيابات</h2>
                  {canApprove && !hasDuplicates && (
                    <Button
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending}
                      className="gap-2 bg-primary-600 hover:bg-primary-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {approveMutation.isPending ? 'جاري المصادقة...' : 'مصادقة الكشف اليومي'}
                    </Button>
                  )}
                  {canApprove && hasDuplicates && (
                    <p className="text-sm text-amber-700">يرجى إزالة التكرار أعلاه أولاً ثم مصادقة الكشف اليومي.</p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredRows.length === 0 ? (
                  <div className="py-16 text-center text-gray-500">
                    لا توجد نتائج تطابق البحث أو الفلاتر
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-right p-4 font-semibold text-gray-700">الاسم الرباعي</th>
                          <th className="text-right p-4 font-semibold text-gray-700">العنوان الوظيفي</th>
                          <th className="text-right p-4 font-semibold text-gray-700">القسم</th>
                          <th className="text-right p-4 font-semibold text-gray-700">نوع الدوام</th>
                          <th className="text-right p-4 font-semibold text-gray-700">مرسل الكشف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map(({ absence, report }) => (
                          <tr
                            key={absence.id}
                            className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                          >
                            <td className="p-4 font-medium text-gray-900">{absence.employee?.fullName ?? '—'}</td>
                            <td className="p-4 text-gray-600">{absence.employee?.jobTitle ?? '—'}</td>
                            <td className="p-4 text-gray-600">{absence.employee?.department?.name ?? '—'}</td>
                            <td className="p-4">
                              <Badge variant="secondary">
                                {WORK_TYPE_LABEL[absence.employee?.workType] ?? absence.employee?.workType ?? '—'}
                              </Badge>
                            </td>
                            <td className="p-4 text-gray-600">{report.createdBy?.name ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By-report summary cards */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">حسب المرسل</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {submittedReports.map((r) => (
                  <Card key={r.id} className="border border-gray-200 shadow-sm">
                    <CardContent className="p-4">
                      <p className="font-medium text-gray-900">{r.createdBy?.name ?? '—'}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {r.absences?.length ?? 0} سجل غياب
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={unapproveOpen}
        onOpenChange={setUnapproveOpen}
        title="إلغاء مصادقة اليوم"
        description={`هل أنت متأكد من إلغاء مصادقة يوم ${dateFormatted}؟ سيصبح بالإمكان التعديل والإضافة مجدداً.`}
        confirmLabel="إلغاء المصادقة"
        variant="danger"
        onConfirm={() => unapproveMutation.mutate()}
      />
    </motion.div>
  );
}
