'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ClipboardCheck, Users, AlertCircle, ChevronLeft, FileDown } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { downloadCSV } from '@/lib/export';

type DataCompletionStats = { totalActive: number; withoutBalanceDate: number };
type EmployeeRow = { id: string; fullName: string; jobTitle?: string; department?: { name: string }; leaveBalance?: string | number; updatedAt?: string };
type EmployeesResponse = { data: EmployeeRow[]; total: number };

export default function DataCompletionPage() {
  const [departmentId, setDepartmentId] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  const statsUrl = departmentId
    ? `/api/employees/data-completion-stats?departmentId=${encodeURIComponent(departmentId)}`
    : '/api/employees/data-completion-stats';
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['employees', 'data-completion-stats', departmentId],
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

  const deptOptions = [
    { value: '', label: 'كل الأقسام' },
    ...(Array.isArray(departments) ? departments.map((d) => ({ value: d.id, label: d.name })) : []),
  ];
  const linkToIncomplete = departmentId
    ? `/dashboard/employees?incompleteOnly=true&departmentId=${encodeURIComponent(departmentId)}`
    : '/dashboard/employees?incompleteOnly=true';

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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <Link href={linkToIncomplete}>
                  <Button className="gap-2 shadow-md">
                    <ChevronLeft className="h-4 w-4" />
                    عرض الموظفين الذين تحتاج بياناتهم إكمالاً ({withoutBalanceDate})
                  </Button>
                </Link>
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
