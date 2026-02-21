'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: object | null;
  createdAt: string;
  user: { name: string };
};

type AuditRes = { data: AuditLog[]; total: number };

const actionLabels: Record<string, string> = {
  LEAVE_APPROVE: 'اعتماد إجازة',
  LEAVE_REJECT: 'رفض إجازة',
  ABSENCE_CREATE: 'تسجيل غياب',
  ABSENCE_CANCEL: 'إلغاء غياب',
  BALANCE_ACCRUAL: 'استحقاق رصيد',
  SCHEDULE_APPROVE: 'اعتماد جدول دوام',
  LOGIN: 'تسجيل دخول',
  CREATE: 'إنشاء',
  EDIT: 'تعديل',
  DELETE: 'حذف',
  PRINT: 'طباعة',
  EXPORT: 'تصدير',
};

const entityLabels: Record<string, string> = {
  LeaveRequest: 'طلب إجازة',
  Absence: 'غياب',
  AbsenceReport: 'كشف غياب',
  WorkSchedule: 'جدول دوام',
  Employee: 'موظف',
  User: 'مستخدم',
  Department: 'قسم',
  Holiday: 'عطلة',
};

function getAuditLink(log: AuditLog): string | null {
  if (log.entity === 'LeaveRequest' && log.entityId) return `/dashboard/leaves?status=PENDING`;
  if (log.entity === 'Absence' || log.entity === 'AbsenceReport') return `/dashboard/absences`;
  if (log.entity === 'WorkSchedule') return `/dashboard/schedules`;
  if (log.entity === 'Employee' && log.entityId) return `/dashboard/employees`;
  return null;
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (entityFilter) params.set('entity', entityFilter);
  if (actionFilter) params.set('action', actionFilter);
  if (fromDate) params.set('fromDate', fromDate);
  if (toDate) params.set('toDate', toDate);

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', page, entityFilter, actionFilter, fromDate, toDate],
    queryFn: () => apiGet<AuditRes>(`/api/audit-logs?${params}`),
  });

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900">سجل التدقيق</h1>
        <p className="text-gray-500 mt-1">تتبع العمليات والتغييرات في النظام (إنشاء، تعديل، اعتماد، حذف، طباعة، تصدير، دخول)</p>
      </div>

      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">نوع الكيان</label>
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 min-w-[140px] text-sm"
              >
                <option value="">الكل</option>
                {Object.entries(entityLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">نوع العملية</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 min-w-[140px] text-sm"
              >
                <option value="">الكل</option>
                {Object.entries(actionLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">من تاريخ</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">إلى تاريخ</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEntityFilter('');
                setActionFilter('');
                setFromDate('');
                setToDate('');
                setPage(1);
              }}
            >
              مسح الفلاتر
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-0 shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-16 text-center text-gray-500">
              حدث خطأ في تحميل البيانات
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="لا توجد سجلات"
              description="ستظهر هنا أحداث النظام (إنشاء، تعديل، اعتماد، حذف) عند حدوثها"
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map((log, i) => {
                const href = getAuditLink(log);
                const content = (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-gray-50/50">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {actionLabels[log.action] || log.action}
                        </p>
                        <p className="text-sm text-gray-500">
                          {log.user?.name} • {entityLabels[log.entity] || log.entity}
                          {log.entityId && ` #${log.entityId.slice(-6)}`}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400">
                      {new Date(log.createdAt).toLocaleString('ar-EG')}
                    </p>
                  </div>
                );
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    {href ? (
                      <Link href={href} className="block">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
          {total > 20 && (
            <div className="flex justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-sm text-gray-500">
                عرض {logs.length} من {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                >
                  التالي
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
