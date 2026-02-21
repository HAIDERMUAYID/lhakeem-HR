'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  UserX,
  Calendar,
  Plus,
  Search,
  Send,
  CheckCircle2,
  Archive,
  Printer,
  Download,
  Undo2,
  FileDown,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableSkeleton } from '@/components/shared/page-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { downloadCSV } from '@/lib/export';
import { useDebounce } from '@/hooks/use-debounce';

const ADD_DEBOUNCE_MS = 200;

type Absence = {
  id: string;
  date: string;
  reason: string | null;
  status: string;
  employee: {
    id: string;
    fullName: string;
    jobTitle?: string;
    workType: string;
    department?: { id: string; name: string };
  };
};

type AbsencesRes = { data: Absence[]; total: number };

type EmployeeOption = {
  id: string;
  fullName: string;
  jobTitle: string;
  workType: string;
  department: { id: string; name: string };
};

type AbsenceReport = {
  id: string;
  reportDate: string;
  status: string;
  submittedAt: string | null;
  createdBy?: { id: string; name: string };
  absences: (Absence & { employee: EmployeeOption & { department?: { id: string; name: string } } })[];
};

const WORK_TYPE_LABEL: Record<string, string> = {
  MORNING: 'صباحي',
  SHIFTS: 'خفار',
};

export default function AbsencesPage() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<'report' | 'archive'>('report');
  const [unapproveConfirmOpen, setUnapproveConfirmOpen] = useState(false);

  const [isOfficer, setIsOfficer] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [legacyOnly, setLegacyOnly] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        const p = JSON.parse(u)?.permissions ?? [];
        const officer = p.includes('ADMIN') || p.includes('FINGERPRINT_OFFICER');
        const manager = p.includes('ADMIN') || p.includes('FINGERPRINT_MANAGER');
        setIsOfficer(officer);
        setIsManager(manager);
        setLegacyOnly(!officer && !manager && (p.includes('ABSENCES_CREATE') || p.includes('ABSENCES_CANCEL')));
      } catch {
        setLegacyOnly(false);
      }
    }
  }, []);

  const useNewFlow = isOfficer || isManager;

  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
    error: reportErr,
  } = useQuery({
    queryKey: ['absence-report', selectedDate],
    queryFn: () =>
      apiGet<AbsenceReport>(
        `/api/absence-reports/report?date=${selectedDate}`
      ),
    enabled: useNewFlow && isOfficer && viewMode === 'report' && !!selectedDate,
    retry: false,
  });

  const { data: reportsByDate, isLoading: reportsLoading } = useQuery({
    queryKey: ['absence-reports-by-date', selectedDate],
    queryFn: () =>
      apiGet<AbsenceReport[]>(
        `/api/absence-reports/by-date?date=${selectedDate}`
      ),
    enabled: useNewFlow && isManager && viewMode === 'report' && !!selectedDate,
  });

  const { data: consolidated, isLoading: consolidatedLoading } = useQuery({
    queryKey: ['absence-consolidated', selectedDate],
    queryFn: () =>
      apiGet<{ consolidation: { approvedBy?: { name: string }; approvedAt: string } | null; absences: Absence[] }>(
        `/api/absence-reports/consolidated?date=${selectedDate}`
      ),
    enabled: useNewFlow && !!selectedDate && (viewMode === 'archive' || (isManager && reportsByDate?.length !== undefined)),
  });

  const { data: dateLocked } = useQuery({
    queryKey: ['absence-date-locked', selectedDate],
    queryFn: () => apiGet<boolean>(`/api/absence-reports/date-locked?date=${selectedDate}`),
    enabled: useNewFlow && !!selectedDate,
  });

  const submittedReports = Array.isArray(reportsByDate) ? reportsByDate.filter((r) => r.status === 'SUBMITTED') : [];
  const canApprove = isManager && submittedReports.length > 0 && !dateLocked;
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

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const addSearchRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(employeeSearch.trim(), ADD_DEBOUNCE_MS);
  const { data: employeesRes, isFetching: employeesFetching } = useQuery({
    queryKey: ['absence-officer-employees', debouncedSearch],
    queryFn: () =>
      apiGet<{ data: EmployeeOption[] }>(
        `/api/absence-reports/employees?search=${encodeURIComponent(debouncedSearch)}&limit=50`
      ),
    enabled: useNewFlow && isOfficer && debouncedSearch.length >= 1,
  });
  const officerEmployees = employeesRes?.data ?? [];
  const existingIds = new Set((report?.absences ?? []).map((a) => a.employee?.id).filter(Boolean));
  const addableEmployees = officerEmployees.filter((e) => !existingIds.has(e.id));

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (addSearchRef.current && !addSearchRef.current.contains(e.target as Node)) setAddDropdownOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const addAbsenceMutation = useMutation({
    mutationFn: (body: { reportId: string; employeeId: string }) =>
      apiPost<Absence & { employee: EmployeeOption & { department?: { id: string; name: string } } }>(
        `/api/absence-reports/${body.reportId}/absences`,
        { employeeId: body.employeeId }
      ),
    onMutate: async (variables: { reportId: string; employeeId: string; employee?: EmployeeOption }) => {
      const emp = variables.employee;
      if (!emp) return {};
      const prev = queryClient.getQueryData<AbsenceReport>(['absence-report', selectedDate]);
      if (!prev) return {};
      const optimisticAbsence = {
        id: `pending-${emp.id}`,
        date: selectedDate,
        status: 'RECORDED',
        reason: null,
        employee: {
          id: emp.id,
          fullName: emp.fullName,
          jobTitle: emp.jobTitle,
          workType: emp.workType,
          department: emp.department,
        },
      };
      queryClient.setQueryData<AbsenceReport>(['absence-report', selectedDate], {
        ...prev,
        absences: [...(prev.absences ?? []), optimisticAbsence],
      });
      return { previousReport: prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absence-report', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-reports-by-date', selectedDate] });
      setEmployeeSearch('');
      setAddDropdownOpen(false);
      toast.success('تمت إضافة الموظف للكشف');
    },
    onError: (e: Error, _variables, context: { previousReport?: AbsenceReport } | undefined) => {
      if (context?.previousReport) {
        queryClient.setQueryData(['absence-report', selectedDate], context.previousReport);
      }
      toast.error(e.message);
    },
  });

  const removeAbsenceMutation = useMutation({
    mutationFn: ({ reportId, absenceId }: { reportId: string; absenceId: string }) =>
      apiDelete(`/api/absence-reports/${reportId}/absences/${absenceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absence-report', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-reports-by-date', selectedDate] });
      toast.success('تمت إزالة السجل');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitReportMutation = useMutation({
    mutationFn: (reportId: string) =>
      apiPost(`/api/absence-reports/${reportId}/submit`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absence-report', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-reports-by-date', selectedDate] });
      toast.success('تم إرسال الكشف لمدير البصمة');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      apiPost('/api/absence-reports/consolidation/approve', { date: selectedDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absence-reports-by-date', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-consolidated', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-date-locked', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-report', selectedDate] });
      toast.success('تمت مصادقة الكشف اليومي');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unapproveMutation = useMutation({
    mutationFn: () =>
      apiPost('/api/absence-reports/consolidation/unapprove', { date: selectedDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absence-reports-by-date', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-consolidated', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-date-locked', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['absence-report', selectedDate] });
      setUnapproveConfirmOpen(false);
      toast.success('تم إلغاء المصادقة – يمكن التعديل والإضافة مجدداً');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAddEmployee = (emp: EmployeeOption) => {
    if (!report?.id || addAbsenceMutation.isPending) return;
    addAbsenceMutation.mutate({ reportId: report.id, employeeId: emp.id });
  };

  const isLocked = dateLocked === true;

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
      queryClient.invalidateQueries({ queryKey: ['absence-report', selectedDate] });
      setResolveDuplicateOpen(false);
      toast.success('تمت إزالة التكرار. يمكنك الآن مصادقة الكشف اليومي.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (legacyOnly) {
    return <LegacyAbsencesView />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900">الغيابات</h1>
        <p className="text-gray-500 mt-1">كشوف الغياب اليومية – وحدة البصمة</p>
      </div>

      {useNewFlow && (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">تحديد اليوم</label>
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-48"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={viewMode === 'report' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('report')}
                  >
                    كشف اليوم
                  </Button>
                  <Button
                    variant={viewMode === 'archive' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('archive')}
                    className="gap-1"
                  >
                    <Archive className="h-4 w-4" />
                    أرشيف
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <Link href="/dashboard/absences/official-report">
                      <Printer className="h-4 w-4" />
                      كشف رسمي / طباعة
                    </Link>
                  </Button>
                </div>
                {isLocked && (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      تمت المصادقة
                    </Badge>
                    {isManager && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => setUnapproveConfirmOpen(true)}
                        disabled={unapproveMutation.isPending}
                      >
                        <Undo2 className="h-4 w-4" />
                        إلغاء المصادقة
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <ConfirmDialog
            open={unapproveConfirmOpen}
            onOpenChange={setUnapproveConfirmOpen}
            title="إلغاء مصادقة اليوم"
            description={`هل أنت متأكد من إلغاء مصادقة يوم ${new Date(selectedDate).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}؟ سيصبح بالإمكان التعديل والإضافة والحذف مجدداً.`}
            confirmLabel="إلغاء المصادقة"
            variant="danger"
            onConfirm={() => unapproveMutation.mutate()}
          />

          {viewMode === 'report' && (
            <>
              {isOfficer && (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold">كشف الغياب – {new Date(selectedDate).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h2>
                    </div>

                    {!isLocked && report?.id && (
                      <div ref={addSearchRef} className="relative mb-4">
                        <div className="relative">
                          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                          <Input
                            value={employeeSearch}
                            onChange={(e) => {
                              setEmployeeSearch(e.target.value);
                              setAddDropdownOpen(true);
                            }}
                            onFocus={() => setAddDropdownOpen(true)}
                            placeholder="أضف اسمًا — اكتب الاسم أو القسم أو المسمى ثم اختر من القائمة"
                            className="pr-10 rounded-xl"
                          />
                        </div>
                        {addDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-gray-200 bg-white shadow-lg max-h-56 overflow-hidden">
                            {addAbsenceMutation.isPending ? (
                              <p className="p-4 text-sm text-gray-600 text-center">جاري الإضافة...</p>
                            ) : employeesFetching ? (
                              <p className="p-4 text-sm text-gray-500 text-center">جاري التحميل...</p>
                            ) : !employeeSearch.trim() ? (
                              <p className="p-4 text-sm text-gray-500 text-center">اكتب للبحث عن موظف</p>
                            ) : addableEmployees.length === 0 ? (
                              <p className="p-4 text-sm text-gray-500 text-center">لا توجد نتائج أو الكل مضاف مسبقاً</p>
                            ) : (
                              <div className="overflow-y-auto max-h-52">
                                {addableEmployees.map((e) => (
                                  <button
                                    key={e.id}
                                    type="button"
                                    onClick={() => handleAddEmployee(e)}
                                    disabled={addAbsenceMutation.isPending}
                                    className="w-full text-right px-4 py-2.5 hover:bg-gray-50 flex flex-col items-start gap-0.5 disabled:opacity-50"
                                  >
                                    <span className="font-medium">{e.fullName}</span>
                                    <span className="text-xs text-gray-500">
                                      {e.jobTitle} — {e.department?.name}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {reportLoading ? (
                      <TableSkeleton rows={3} />
                    ) : reportError ? (
                      <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-sm">
                        {(reportErr as Error)?.message?.includes('أقسام') || (reportErr as Error)?.message?.includes('مرتبط')
                          ? 'يجب ربطك بأقسام مسؤول عنها من قبل المدير (صلاحيات المستخدم → موظف بصمة → الأقسام).'
                          : (reportErr as Error)?.message ?? 'حدث خطأ في تحميل الكشف'}
                      </div>
                    ) : !report ? (
                      <p className="text-gray-500 py-4">اختر تاريخاً ثم سيتم إنشاء كشف جديد أو فتح الكشف الموجود.</p>
                    ) : (
                      <>
                        {/* جدول: من md فما فوق */}
                        <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 max-w-full">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-right p-3 font-medium">الاسم الرباعي</th>
                                <th className="text-right p-3 font-medium">العنوان الوظيفي</th>
                                <th className="text-right p-3 font-medium">القسم</th>
                                <th className="text-right p-3 font-medium">نوع الدوام</th>
                                <th className="text-right p-3 font-medium">تاريخ الغياب</th>
                                {!isLocked && <th className="w-20" />}
                              </tr>
                            </thead>
                            <tbody>
                              {report.absences?.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="text-center text-gray-500 p-6">
                                    لا توجد سجلات. اكتب اسم الموظف في مربع البحث أعلاه للإضافة.
                                  </td>
                                </tr>
                              ) : (
                                report.absences?.map((a) => (
                                  <tr
                                    key={a.id}
                                    className={`border-b border-gray-100 hover:bg-gray-50/50 ${String(a.id).startsWith('pending-') ? 'bg-blue-50/60' : ''}`}
                                  >
                                    <td className="p-3 font-medium">
                                      {a.employee?.fullName}
                                      {String(a.id).startsWith('pending-') && (
                                        <span className="mr-2 text-xs text-blue-600 font-normal">(جاري التأكيد...)</span>
                                      )}
                                    </td>
                                    <td className="p-3">{a.employee?.jobTitle ?? '—'}</td>
                                    <td className="p-3">{a.employee?.department?.name ?? '—'}</td>
                                    <td className="p-3">{WORK_TYPE_LABEL[a.employee?.workType] ?? a.employee?.workType ?? '—'}</td>
                                    <td className="p-3">{new Date(a.date).toLocaleDateString('ar-EG')}</td>
                                    {!isLocked && (
                                      <td className="p-2">
                                        {!String(a.id).startsWith('pending-') && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-red-600 hover:bg-red-50 min-h-[44px]"
                                            onClick={() =>
                                              removeAbsenceMutation.mutate({
                                                reportId: report.id,
                                                absenceId: a.id,
                                              })
                                            }
                                            disabled={removeAbsenceMutation.isPending}
                                          >
                                            حذف
                                          </Button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                        {/* بطاقات: على الجوال فقط */}
                        {report.absences && report.absences.length > 0 && (
                          <div className="md:hidden space-y-3">
                            {report.absences.map((a) => (
                              <Card key={a.id} className={`border shadow-sm ${String(a.id).startsWith('pending-') ? 'bg-blue-50/60 border-blue-100' : ''}`}>
                                <CardContent className="p-4">
                                  <p className="font-medium text-gray-900">{a.employee?.fullName ?? '—'}</p>
                                  <p className="text-sm text-gray-500">{a.employee?.jobTitle ?? '—'} • {a.employee?.department?.name ?? '—'}</p>
                                  <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                                    <span className="text-xs text-gray-500">
                                      {WORK_TYPE_LABEL[a.employee?.workType] ?? a.employee?.workType ?? '—'} — {new Date(a.date).toLocaleDateString('ar-EG')}
                                    </span>
                                    {!isLocked && !String(a.id).startsWith('pending-') && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-red-600 hover:bg-red-50 min-h-[44px]"
                                        onClick={() =>
                                          removeAbsenceMutation.mutate({
                                            reportId: report.id,
                                            absenceId: a.id,
                                          })
                                        }
                                        disabled={removeAbsenceMutation.isPending}
                                      >
                                        حذف
                                      </Button>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                        {report.absences?.length === 0 && (
                          <p className="md:hidden text-center text-gray-500 py-4">لا توجد سجلات. ابحث عن موظف أعلاه للإضافة.</p>
                        )}

                        {!isLocked && report.absences?.length > 0 && (
                          <div className="mt-4 flex justify-end">
                            <Button
                              onClick={() => submitReportMutation.mutate(report.id)}
                              disabled={submitReportMutation.isPending}
                              className="gap-2 min-h-[44px]"
                            >
                              <Send className="h-4 w-4" />
                              {submitReportMutation.isPending ? 'جاري الإرسال...' : 'إرسال لمدير البصمة'}
                            </Button>
                          </div>
                        )}
                        {report.status === 'SUBMITTED' && !isLocked && (
                          <Badge variant="secondary" className="mt-2">مرسل — يمكنك التعديل والحذف حتى تتم المصادقة</Badge>
                        )}
                        {report.status === 'SUBMITTED' && isLocked && (
                          <Badge variant="secondary" className="mt-2">مرسل</Badge>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {hasDuplicates && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
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

              {isManager && (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                      <h2 className="text-lg font-semibold">الكشوف المرسلة لهذا اليوم</h2>
                      {submittedReports.length > 0 && (
                        <Button variant="outline" size="sm" className="gap-1.5" asChild>
                          <Link href={`/dashboard/absences/day?date=${selectedDate}`}>
                            عرض صفحة الكشوف المرسلة
                            <span className="mr-1 opacity-70">←</span>
                          </Link>
                        </Button>
                      )}
                    </div>
                    {reportsLoading ? (
                      <TableSkeleton rows={2} />
                    ) : submittedReports.length === 0 ? (
                      <p className="text-gray-500">لا توجد كشوف مرسلة لهذا اليوم بعد.</p>
                    ) : (
                      <div className="space-y-4">
                        {submittedReports.map((r) => (
                          <div key={r.id} className="rounded-xl border border-gray-200 p-4">
                            <p className="font-medium text-gray-700 mb-2">
                              من: {r.createdBy?.name ?? '—'} ({r.absences?.length ?? 0} سجل)
                            </p>
                            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                              {r.absences?.slice(0, 5).map((a) => (
                                <li key={a.id}>{a.employee?.fullName}</li>
                              ))}
                              {(r.absences?.length ?? 0) > 5 && (
                                <li>... و {(r.absences?.length ?? 0) - 5} آخرين</li>
                              )}
                            </ul>
                          </div>
                        ))}
                        {canApprove && !hasDuplicates && (
                          <Button
                            onClick={() => approveMutation.mutate()}
                            disabled={approveMutation.isPending}
                            className="gap-2 mt-2"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {approveMutation.isPending ? 'جاري المصادقة...' : 'مصادقة الكشف اليومي'}
                          </Button>
                        )}
                        {canApprove && hasDuplicates && (
                          <p className="text-sm text-amber-700 mt-2">يرجى إزالة التكرار أعلاه أولاً ثم مصادقة الكشف اليومي.</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {viewMode === 'archive' && (
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-4">الكشف النهائي المعتمد</h2>
                <p className="text-sm text-gray-500 mb-2">التاريخ: {new Date(selectedDate).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                {consolidatedLoading ? (
                  <TableSkeleton rows={3} />
                ) : !consolidated?.consolidation && consolidated?.absences?.length === 0 ? (
                  <p className="text-gray-500">لا يوجد كشف معتمد لهذا اليوم.</p>
                ) : (
                  <>
                    {consolidated?.consolidation && (
                      <p className="text-sm text-gray-600 mb-2">
                        تمت المصادقة بواسطة: {consolidated.consolidation.approvedBy?.name ?? '—'} في{' '}
                        {new Date(consolidated.consolidation.approvedAt).toLocaleString('ar-EG')}
                      </p>
                    )}
                    <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 mb-4 max-w-full">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-right p-3 font-medium">الاسم الرباعي</th>
                            <th className="text-right p-3 font-medium">العنوان الوظيفي</th>
                            <th className="text-right p-3 font-medium">القسم</th>
                            <th className="text-right p-3 font-medium">نوع الدوام</th>
                            <th className="text-right p-3 font-medium">تاريخ الغياب</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(consolidated?.absences ?? []).map((a) => (
                            <tr key={a.id} className="border-b border-gray-100">
                              <td className="p-3 font-medium">{a.employee?.fullName}</td>
                              <td className="p-3">{a.employee?.jobTitle ?? '—'}</td>
                              <td className="p-3">{a.employee?.department?.name ?? '—'}</td>
                              <td className="p-3">{WORK_TYPE_LABEL[a.employee?.workType] ?? '—'}</td>
                              <td className="p-3">{new Date(a.date).toLocaleDateString('ar-EG')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="md:hidden space-y-3 mb-4">
                      {(consolidated?.absences ?? []).map((a) => (
                        <Card key={a.id} className="border border-gray-200 shadow-sm">
                          <CardContent className="p-4">
                            <p className="font-medium text-gray-900">{a.employee?.fullName}</p>
                            <p className="text-sm text-gray-500">{a.employee?.jobTitle ?? '—'} • {a.employee?.department?.name ?? '—'}</p>
                            <p className="text-xs text-gray-500 mt-1">{WORK_TYPE_LABEL[a.employee?.workType] ?? '—'} — {new Date(a.date).toLocaleDateString('ar-EG')}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 min-h-[44px]"
                        onClick={() => window.print()}
                      >
                        <Printer className="h-4 w-4" />
                        طباعة
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 min-h-[44px]"
                        onClick={() => {
                          const abs = consolidated?.absences ?? [];
                          const headers = ['الاسم الرباعي', 'العنوان الوظيفي', 'القسم', 'نوع الدوام', 'تاريخ الغياب'];
                          const rows = abs.map((a) => [
                            a.employee?.fullName ?? '',
                            a.employee?.jobTitle ?? '',
                            a.employee?.department?.name ?? '',
                            WORK_TYPE_LABEL[a.employee?.workType ?? ''] ?? a.employee?.workType ?? '',
                            new Date(a.date).toLocaleDateString('ar-EG'),
                          ]);
                          downloadCSV(headers, rows, `غيابات-${new Date().toISOString().slice(0, 10)}.csv`);
                        }}
                      >
                        <Download className="h-4 w-4" />
                        تصدير CSV
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

    </motion.div>
  );
}

function LegacyAbsencesView() {
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [absenceToCancel, setAbsenceToCancel] = useState<Absence | null>(null);
  const [form, setForm] = useState({ employeeId: '', date: '', reason: '' });
  const [canAddAbsence, setCanAddAbsence] = useState(false);
  const [canCancelAbsence, setCanCancelAbsence] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        const p = JSON.parse(u)?.permissions ?? [];
        setCanAddAbsence(p.includes('ADMIN') || p.includes('ABSENCES_CREATE'));
        setCanCancelAbsence(p.includes('ADMIN') || p.includes('ABSENCES_CANCEL'));
      } catch {
        setCanAddAbsence(false);
      }
    }
  }, []);

  const { data: employees } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () =>
      apiGet<{ data: { id: string; fullName: string }[] }>('/api/employees?limit=100'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/api/absences/${id}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      setCancelOpen(false);
      setAbsenceToCancel(null);
      toast.success('تم إلغاء الغياب');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addMutation = useMutation({
    mutationFn: (body: { employeeId: string; date: string; reason?: string }) =>
      apiPost('/api/absences', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      setAddOpen(false);
      setForm({ employeeId: '', date: '', reason: '' });
      toast.success('تم تسجيل الغياب بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['absences', page],
    queryFn: () => apiGet<AbsencesRes>(`/api/absences?page=${page}&limit=10`),
    staleTime: 45 * 1000,
  });

  const absences = data?.data ?? [];
  const total = data?.total ?? 0;

  const [exporting, setExporting] = useState(false);
  const handleExportAbsencesCSV = async () => {
    setExporting(true);
    try {
      const res = await apiGet<AbsencesRes>('/api/absences?page=1&limit=100');
      const list = res?.data ?? [];
      const headers = ['الموظف', 'العنوان الوظيفي', 'القسم', 'نوع الدوام', 'التاريخ', 'السبب', 'الحالة'];
      const rows = list.map((a) => [
        a.employee?.fullName ?? '',
        a.employee?.jobTitle ?? '',
        a.employee?.department?.name ?? '',
        WORK_TYPE_LABEL[a.employee?.workType] ?? a.employee?.workType ?? '',
        new Date(a.date).toLocaleDateString('ar-EG'),
        a.reason ?? '',
        a.status === 'CANCELLED' ? 'ملغى' : 'مسجل',
      ]);
      downloadCSV(headers, rows, `غيابات-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`تم تصدير ${list.length} سجل`);
    } catch {
      toast.error('فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الغيابات</h1>
          <p className="text-gray-500 mt-1">تسجيل ومتابعة الغيابات اليومية</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportAbsencesCSV}
            disabled={exporting || total === 0}
            className="gap-2"
          >
            <FileDown className="h-5 w-5" />
            {exporting ? 'جاري التصدير...' : 'تصدير CSV'}
          </Button>
          {canAddAbsence && (
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-5 w-5" />
              تسجيل غياب
            </Button>
          )}
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="تسجيل غياب">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate(form);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الموظف</label>
            <select
              value={form.employeeId}
              onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
              required
              className="flex h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-base"
            >
              <option value="">اختر الموظف</option>
              {(employees?.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">السبب (اختياري)</label>
            <Input
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? 'جاري التسجيل...' : 'تسجيل'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      <Card className="overflow-hidden border-0 shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : error ? (
            <div className="py-16 text-center text-gray-500">حدث خطأ في تحميل البيانات</div>
          ) : absences.length === 0 ? (
            <EmptyState
              icon={UserX}
              title="لا توجد غيابات مسجلة"
              description="اختر الموظف والتاريخ ثم سجّل غياب جديد"
              actionLabel="تسجيل غياب"
              actionIcon={Plus}
              onAction={() => setAddOpen(true)}
              compact
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {absences.map((abs, i) => (
                <motion.div
                  key={abs.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-gray-50/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center">
                      <UserX className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{abs.employee.fullName}</p>
                      <p className="text-sm text-gray-500">{abs.employee.department?.name}</p>
                      {abs.reason && <p className="text-sm text-gray-400 mt-1">{abs.reason}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      {new Date(abs.date).toLocaleDateString('ar-EG', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      {abs.status === 'RECORDED' && canCancelAbsence && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-600 hover:bg-red-50"
                          onClick={() => {
                            setAbsenceToCancel(abs);
                            setCancelOpen(true);
                          }}
                          disabled={cancelMutation.isPending}
                        >
                          إلغاء الغياب
                        </Button>
                      )}
                      <Badge variant={abs.status === 'RECORDED' ? 'default' : 'success'}>
                        {abs.status === 'RECORDED' ? 'مسجل' : 'ملغى'}
                      </Badge>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
        {total > 10 && (
          <div className="flex justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-sm text-gray-500">
              عرض {absences.length} من {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-sm text-primary-600 hover:underline disabled:opacity-50"
              >
                السابق
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={absences.length < 10}
                className="text-sm text-primary-600 hover:underline disabled:opacity-50"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="إلغاء الغياب"
        description={
          absenceToCancel
            ? `هل أنت متأكد من إلغاء غياب ${absenceToCancel.employee.fullName} بتاريخ ${new Date(absenceToCancel.date).toLocaleDateString('ar-EG')}؟`
            : undefined
        }
        confirmLabel="إلغاء الغياب"
        variant="danger"
        onConfirm={async () => {
          if (absenceToCancel) await cancelMutation.mutateAsync(absenceToCancel.id);
        }}
      />
    </motion.div>
  );
}
