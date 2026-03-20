'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';

type AuditLog = {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: object | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { name: string; username: string | null } | null;
  message?: string;
  deviceLabel?: string;
  browserLabel?: string;
  osLabel?: string;
};

type AuditRes = { data: AuditLog[]; total: number };
type ActiveSession = {
  userId: string;
  userName: string;
  username: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceLabel: string;
  browserLabel: string;
  osLabel: string;
  lastSeenAt: string;
  firstSeenAt: string;
  actionsCount: number;
  isActiveNow: boolean;
};
type ActiveSessionsRes = { data: ActiveSession[]; total: number; windowMinutes: number };

const actionLabels: Record<string, string> = {
  LOGIN_SUCCESS: 'تسجيل دخول ناجح',
  LOGIN_FAILED: 'فشل تسجيل دخول',
  PASSWORD_CHANGE: 'تغيير كلمة المرور',
  LEAVE_APPROVE: 'اعتماد إجازة',
  LEAVE_REJECT: 'رفض إجازة',
  ABSENCE_CREATE: 'تسجيل غياب',
  ABSENCE_CANCEL: 'إلغاء غياب',
  BALANCE_ACCRUAL: 'استحقاق رصيد',
  BALANCE_ACCRUAL_DAILY: 'استحقاق رصيد يومي',
  SCHEDULE_APPROVE: 'اعتماد جدول دوام',
  LOGIN: 'تسجيل دخول',
  CREATE: 'إنشاء',
  EDIT: 'تعديل',
  DELETE: 'حذف',
  PRINT: 'طباعة',
  EXPORT: 'تصدير',
  HTTP_GET: 'طلب قراءة (GET)',
  HTTP_POST: 'طلب إنشاء/إجراء (POST)',
  HTTP_PUT: 'طلب تحديث كامل (PUT)',
  HTTP_PATCH: 'طلب تعديل جزئي (PATCH)',
  HTTP_DELETE: 'طلب حذف (DELETE)',
};

const entityLabels: Record<string, string> = {
  Auth: 'المصادقة',
  LeaveRequest: 'طلب إجازة',
  Absence: 'غياب',
  AbsenceReport: 'كشف غياب',
  WorkSchedule: 'جدول دوام',
  Employee: 'موظف',
  User: 'مستخدم',
  Department: 'قسم',
  Holiday: 'عطلة',
  'leave-requests': 'الإجازات',
  employees: 'الموظفون',
  users: 'المستخدمون',
  departments: 'الأقسام',
  units: 'الوحدات',
  absences: 'الغياب',
  'leave-types': 'أنواع الإجازة',
  'work-schedules': 'جداول الدوام',
  balance: 'الرصيد',
  holidays: 'العطل',
  devices: 'أجهزة البصمة',
  imports: 'الاستيراد',
  reports: 'التقارير',
  settings: 'الإعدادات',
  'audit-logs': 'سجل التدقيق',
  'fingerprint-calendar': 'تقويم البصمة',
  'absence-reports': 'كشوف الغياب',
  api: 'واجهة API',
};

function getAuditLink(log: AuditLog): string | null {
  if (log.entity === 'LeaveRequest' && log.entityId) return `/dashboard/leaves?status=PENDING`;
  if (log.entity === 'Absence' || log.entity === 'AbsenceReport') return `/dashboard/absences`;
  if (log.entity === 'WorkSchedule') return `/dashboard/schedules`;
  if (log.entity === 'Employee' && log.entityId) return `/dashboard/employees`;
  if (log.entity === 'leave-requests') return `/dashboard/leaves`;
  if (log.entity === 'employees') return `/dashboard/employees`;
  if (log.entity === 'absences') return `/dashboard/absences`;
  if (log.entity === 'departments') return `/dashboard/departments`;
  if (log.entity === 'users') return `/dashboard/users`;
  return null;
}

function formatDetails(details: object | null): string {
  if (!details || typeof details !== 'object') return '—';
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function friendlyAuditMessage(log: AuditLog): string {
  if (log.message?.trim()) return log.message;
  const action = actionLabels[log.action] || log.action;
  const entity = entityLabels[log.entity] || log.entity;
  return `${action} على ${entity}`;
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const pageSize = 25;
  const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
  if (entityFilter) params.set('entity', entityFilter);
  if (actionFilter) params.set('action', actionFilter);
  if (usernameFilter.trim()) params.set('username', usernameFilter.trim());
  if (fromDate) params.set('fromDate', fromDate);
  if (toDate) params.set('toDate', toDate);

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', page, entityFilter, actionFilter, usernameFilter, fromDate, toDate],
    queryFn: () => apiGet<AuditRes>(`/api/audit-logs?${params}`),
  });
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['audit-active-sessions'],
    queryFn: () => apiGet<ActiveSessionsRes>('/api/audit-logs/active-sessions?minutes=180'),
  });

  const logs = data?.data ?? [];
  const sessions = sessionsData?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const userLine = (log: AuditLog) => {
    if (log.user?.name) return log.user.name;
    if (log.userId) return `معرّف مستخدم: ${log.userId.slice(-8)}`;
    return 'بدون مستخدم (محاولة دخول فاشلة أو نظام)';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900">سجل التدقيق</h1>
        <p className="text-gray-500 mt-1 max-w-3xl">
          يُسجَّل تلقائياً: تسجيل الدخول (نجاح/فشل)، تغيير كلمة المرور، و<strong>كل طلبات API</strong> (مسار، استعلام، جسم الطلب بعد إخفاء كلمات المرور، رمز الاستجابة، المدة، عنوان IP، المتصفح).
        </p>
      </div>

      <Card className="overflow-hidden border-0 shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">الجلسات النشطة</h2>
            <span className="text-xs text-gray-500">آخر 3 ساعات</span>
          </div>
          {sessionsLoading ? (
            <div className="text-sm text-gray-500 py-3">جاري تحميل الجلسات...</div>
          ) : sessions.length === 0 ? (
            <div className="text-sm text-gray-500 py-3">لا توجد جلسات نشطة حاليًا</div>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 12).map((s, idx) => (
                <div
                  key={`${s.userId}-${s.ipAddress}-${idx}`}
                  className="rounded-xl border border-gray-100 bg-white p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {s.userName}
                      {s.username ? ` (@${s.username})` : ''}
                    </p>
                    <p className="text-sm text-gray-600">
                      {s.deviceLabel} • {s.browserLabel} • {s.osLabel}
                    </p>
                    <p className="text-xs text-gray-400 break-all">
                      {s.ipAddress || 'IP غير متوفر'} • آخر نشاط: {new Date(s.lastSeenAt).toLocaleString('ar-EG')}
                    </p>
                  </div>
                  <div className="text-xs">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 ${
                        s.isActiveNow ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {s.isActiveNow ? 'نشطة الآن' : 'غير نشطة الآن'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">نوع الكيان / المسار</label>
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 min-w-[160px] text-sm min-h-[44px]"
              >
                <option value="">الكل</option>
                {Object.entries(entityLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">نوع العملية</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 min-w-[200px] text-sm min-h-[44px]"
              >
                <option value="">الكل</option>
                {Object.entries(actionLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">اسم المستخدم</label>
              <Input
                value={usernameFilter}
                onChange={(e) => setUsernameFilter(e.target.value)}
                placeholder="مثال: admin"
                className="w-48"
              />
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
                setUsernameFilter('');
                setFromDate('');
                setToDate('');
                setPage(1);
              }}
              className="min-h-[44px]"
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
            <div className="py-16 text-center text-gray-500">حدث خطأ في تحميل البيانات</div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="لا توجد سجلات"
              description="عند استخدام النظام ستظهر هنا الأحداث والطلبات تلقائياً"
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map((log, i) => {
                const href = getAuditLink(log);
                const isOpen = !!expanded[log.id];
                const inner = (
                  <div className="p-4 hover:bg-gray-50/50 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                          <FileText className="h-5 w-5 text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-gray-900">
                              {friendlyAuditMessage(log)}
                            </p>
                            {href && (
                              <Link
                                href={href}
                                className="text-xs text-primary-600 underline shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                فتح الصفحة
                              </Link>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {userLine(log)}
                            {log.user?.username ? ` (@${log.user.username})` : ''}
                          </p>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {entityLabels[log.entity] || log.entity}
                            {log.entityId && ` • مرجع #${log.entityId.slice(-8)}`}
                          </p>
                          {(log.deviceLabel || log.browserLabel || log.osLabel) && (
                            <p className="text-xs text-gray-500 mt-1">
                              {(log.deviceLabel || 'جهاز غير معروف') +
                                ' • ' +
                                (log.browserLabel || 'متصفح غير معروف') +
                                ' • ' +
                                (log.osLabel || 'نظام غير معروف')}
                            </p>
                          )}
                          {(log.ipAddress || log.userAgent) && (
                            <p className="text-xs text-gray-400 mt-1 break-all">
                              {log.ipAddress && <span>IP: {log.ipAddress} </span>}
                              {log.userAgent && (
                                <span className="block sm:inline sm:mr-2">• {log.userAgent.slice(0, 120)}</span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-sm text-gray-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('ar-EG')}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="min-h-[40px] gap-1"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleExpand(log.id);
                          }}
                        >
                          {isOpen ? (
                            <>
                              إخفاء التفاصيل <ChevronUp className="h-4 w-4" />
                            </>
                          ) : (
                            <>
                              عرض التفاصيل <ChevronDown className="h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 overflow-x-auto">
                        <p className="text-xs font-medium text-gray-500 mb-2">تفاصيل JSON</p>
                        <pre className="text-xs text-gray-800 whitespace-pre-wrap break-words dir-ltr text-left font-mono">
                          {formatDetails(log.details)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    {inner}
                  </motion.div>
                );
              })}
            </div>
          )}
          {total > pageSize && (
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
