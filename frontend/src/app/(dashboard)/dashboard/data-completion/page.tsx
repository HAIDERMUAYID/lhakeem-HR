'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ClipboardCheck, Users, AlertCircle, ChevronLeft, FileDown, RotateCcw, CheckCircle2, TimerReset } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { downloadCSV } from '@/lib/export';

type DataCompletionStats = {
  totalActive: number;
  withoutBalanceDate: number;
  baseline: string | null;
  updatedIncompleteSinceBaseline: number;
};
type EmployeeRow = { id: string; fullName: string; jobTitle?: string; department?: { name: string }; leaveBalance?: string | number; updatedAt?: string };
type EmployeesResponse = { data: EmployeeRow[]; total: number };

export default function DataCompletionPage() {
  const [departmentId, setDepartmentId] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [baseline, setBaseline] = useState<string>('');

  const baselineStorageKey = useMemo(
    () => `data-completion-baseline:v1:${departmentId || 'all'}`,
    [departmentId]
  );

  useEffect(() => {
    try {
      const v = localStorage.getItem(baselineStorageKey) || '';
      setBaseline(v);
    } catch {
      setBaseline('');
    }
  }, [baselineStorageKey]);

  const statsUrl = (() => {
    const params = new URLSearchParams();
    if (departmentId) params.set('departmentId', departmentId);
    if (baseline) params.set('baseline', baseline);
    const q = params.toString();
    return q ? `/api/employees/data-completion-stats?${q}` : '/api/employees/data-completion-stats';
  })();
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['employees', 'data-completion-stats', departmentId, baseline],
    queryFn: () => apiGet<DataCompletionStats>(statsUrl),
    staleTime: 60 * 1000,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments-list'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/departments'),
    staleTime: 5 * 60 * 1000,
  });

  const totalActive = stats?.totalActive ?? 0;
  const withoutBalanceDate = stats?.withoutBalanceDate ?? 0;
  const completed = Math.max(0, totalActive - withoutBalanceDate);
  const updatedIncompleteSinceBaseline = stats?.updatedIncompleteSinceBaseline ?? 0;
  const remainingNotUpdated = Math.max(0, withoutBalanceDate - updatedIncompleteSinceBaseline);
  const baselineEffective = stats?.baseline ?? (baseline || null);

  const exportIncomplete = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('incompleteOnly', 'true');
      params.set('limit', '500');
      if (departmentId) params.set('departmentId', departmentId);
      const res = await apiGet<EmployeesResponse>(`/api/employees?${params}`);
      const list = res?.data ?? [];
      const headers = ['الاسم', 'العنوان الوظيفي', 'القسم', 'الرصيد', 'آخر تحديث'];
      const rows = list.map((e) => [
        e.fullName,
        e.jobTitle ?? '',
        e.department?.name ?? '—',
        String(e.leaveBalance ?? '—'),
        e.updatedAt ? new Date(e.updatedAt).toLocaleDateString('ar-EG', { dateStyle: 'short' }) : '—',
      ]);
      downloadCSV(headers, rows, `موظفين-تحتاج-إكمال-بيانات-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`تم تصدير ${list.length} سجل`);
    } catch {
      toast.error('فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  const exportRemainingNotUpdated = async () => {
    if (!baselineEffective) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('incompleteOnly', 'true');
      params.set('updatedBefore', baselineEffective);
      params.set('limit', '5000');
      if (departmentId) params.set('departmentId', departmentId);
      const res = await apiGet<EmployeesResponse>(`/api/employees?${params}`);
      const list = res?.data ?? [];
      const headers = ['الاسم', 'العنوان الوظيفي', 'القسم', 'الرصيد', 'آخر تحديث'];
      const rows = list.map((e) => [
        e.fullName,
        e.jobTitle ?? '',
        e.department?.name ?? '—',
        String(e.leaveBalance ?? '—'),
        e.updatedAt ? new Date(e.updatedAt).toLocaleString('ar-EG') : '—',
      ]);
      downloadCSV(headers, rows, `المتبقي-غير-محدث-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`تم تصدير ${list.length} سجل`);
    } catch {
      toast.error('فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  const deptOptions = [
    { value: '', label: 'كل الأقسام' },
    ...(Array.isArray(departments) ? departments.map((d) => ({ value: d.id, label: d.name })) : []),
  ];
  const linkToIncomplete = departmentId
    ? `/dashboard/employees?incompleteOnly=true&departmentId=${encodeURIComponent(departmentId)}`
    : '/dashboard/employees?incompleteOnly=true';
  const linkToRemainingNotUpdated =
    baselineEffective
      ? (departmentId
          ? `/dashboard/employees?incompleteOnly=true&updatedBefore=${encodeURIComponent(baselineEffective)}&departmentId=${encodeURIComponent(departmentId)}`
          : `/dashboard/employees?incompleteOnly=true&updatedBefore=${encodeURIComponent(baselineEffective)}`)
      : linkToIncomplete;
  const linkToUpdatedSinceBaseline =
    baselineEffective
      ? (departmentId
          ? `/dashboard/employees?incompleteOnly=true&updatedAfter=${encodeURIComponent(baselineEffective)}&departmentId=${encodeURIComponent(departmentId)}`
          : `/dashboard/employees?incompleteOnly=true&updatedAfter=${encodeURIComponent(baselineEffective)}`)
      : linkToIncomplete;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">إكمال البيانات</h1>
          <p className="text-gray-500 mt-1">متابعة من تم تحديث بياناتهم ومن لم تُكمل بعد (رصيد لغاية تاريخ)</p>
          {baselineEffective && (
            <p className="text-xs text-gray-500 mt-1">
              نقطة البداية: <span className="font-medium">{new Date(baselineEffective).toLocaleString('ar-EG')}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={departmentId}
            onChange={(v) => setDepartmentId(v)}
            options={deptOptions}
            placeholder="كل الأقسام"
            className="min-w-[180px]"
          />
          {withoutBalanceDate > 0 && (
            <Button variant="outline" size="sm" onClick={exportIncomplete} disabled={exporting} className="gap-2">
              <FileDown className="h-4 w-4" />
              {exporting ? 'جاري التصدير...' : 'تصدير قائمة من تحتاج بياناتهم (CSV)'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date().toISOString();
              setBaseline(now);
              try {
                localStorage.setItem(baselineStorageKey, now);
              } catch {
                // ignore
              }
              toast.success('تم تصفير المتابعة وإعادة احتساب التقدم');
            }}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            بدء متابعة جديدة (تصفير)
          </Button>
          {baselineEffective && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setBaseline('');
                try {
                  localStorage.removeItem(baselineStorageKey);
                } catch {
                  // ignore
                }
                toast.success('تم إلغاء نقطة البداية');
              }}
              className="gap-2"
            >
              <TimerReset className="h-4 w-4" />
              إلغاء التصفير
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-0 shadow-md animate-pulse">
              <CardContent className="p-6">
                <div className="h-10 bg-gray-200 rounded w-2/3 mb-4" />
                <div className="h-8 bg-gray-100 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="border-0 shadow-md border-red-100">
          <CardContent className="p-6 text-center text-red-600">
            حدث خطأ في تحميل الإحصائيات. تأكد من صلاحية العرض.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary-100 text-primary-700">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">
                      {departmentId ? 'النشطين في القسم المحدد' : 'الموظفين النشطين'}
                    </p>
                    <p className="text-2xl font-bold text-gray-900">{totalActive}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700">
                    <ClipboardCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">تم إكمال بياناتهم (رصيد + تاريخ)</p>
                    <p className="text-2xl font-bold text-gray-900">{completed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-amber-100 text-amber-700">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">لم يُحدد لهم رصيد لغاية تاريخ</p>
                    <p className="text-2xl font-bold text-gray-900">{withoutBalanceDate}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-sky-100 text-sky-700">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">تم تحديثهم بعد التصفير (من الناقص)</p>
                    <p className="text-2xl font-bold text-gray-900">{baselineEffective ? updatedIncompleteSinceBaseline : '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-rose-100 text-rose-700">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">المتبقي لم يُحدّث بعد</p>
                    <p className="text-2xl font-bold text-gray-900">{baselineEffective ? remainingNotUpdated : '—'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-md overflow-hidden">
            <CardHeader className="border-b bg-gray-50/80">
              <h2 className="text-lg font-semibold text-gray-900">الخطوات التالية</h2>
              <p className="text-sm text-gray-500 mt-1">
                لإكمال بيانات الموظفين: ادخل الرصيد التراكمي وحدد «هذا الرصيد صحيح لغاية تاريخ» في صفحة الموظفين.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              {withoutBalanceDate > 0 ? (
                <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                  <Link href={linkToIncomplete}>
                    <Button className="gap-2 shadow-md min-h-[44px]">
                      <ChevronLeft className="h-4 w-4" />
                      عرض كل من يحتاج بياناته إكمالاً ({withoutBalanceDate})
                    </Button>
                  </Link>
                  {baselineEffective && (
                    <>
                      <Link href={linkToRemainingNotUpdated}>
                        <Button variant="outline" className="gap-2 min-h-[44px]">
                          المتبقي غير مُحدّث ({remainingNotUpdated})
                        </Button>
                      </Link>
                      <Link href={linkToUpdatedSinceBaseline}>
                        <Button variant="outline" className="gap-2 min-h-[44px]">
                          تم تحديثهم بعد التصفير ({updatedIncompleteSinceBaseline})
                        </Button>
                      </Link>
                      <Button variant="outline" onClick={exportRemainingNotUpdated} disabled={exporting} className="gap-2 min-h-[44px]">
                        <FileDown className="h-4 w-4" />
                        تصدير المتبقي غير مُحدّث
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-emerald-700 font-medium">تم إكمال بيانات جميع الموظفين النشطين من حيث الرصيد وتاريخ «لغاية».</p>
              )}
              <div className="mt-4">
                <Link href="/dashboard/employees">
                  <Button variant="outline" className="gap-2">
                    <Users className="h-4 w-4" />
                    الذهاب إلى قائمة الموظفين
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </motion.div>
  );
}
