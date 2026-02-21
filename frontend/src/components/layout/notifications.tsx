'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Calendar, FileText, CheckCheck } from 'lucide-react';
import { apiGet } from '@/lib/api';
import Link from 'next/link';

const NOTIF_READ_KEY = 'notif_read';

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
  user: { name: string };
};

const actionLabels: Record<string, string> = {
  LEAVE_APPROVE: 'اعتماد إجازة',
  LEAVE_REJECT: 'رفض إجازة',
  ABSENCE_CREATE: 'تسجيل غياب',
  ABSENCE_CANCEL: 'إلغاء غياب',
  BALANCE_ACCRUAL: 'استحقاق رصيد',
};

/** رابط عميق حسب نوع الكيان */
function getAuditLink(log: AuditLog): string {
  if (log.entity === 'LeaveRequest' && log.entityId) {
    return `/dashboard/leaves?status=PENDING&highlight=${log.entityId}`;
  }
  if (log.entity === 'Absence' && log.entityId) {
    return `/dashboard/absences`;
  }
  if (log.entity === 'AbsenceReport') {
    return `/dashboard/absences`;
  }
  return '/dashboard/audit-logs';
}

export function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [readState, setReadState] = useState<{ dismissedAt: number; countAtDismiss: number } | null>(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        setPerms(JSON.parse(u)?.permissions ?? []);
      } catch {
        setPerms([]);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_READ_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { dismissedAt: number; countAtDismiss: number };
        setReadState(parsed);
      }
    } catch {
      setReadState(null);
    }
  }, [open]);

  const { data: pendingData } = useQuery({
    queryKey: ['notif-pending'],
    queryFn: () => apiGet<{ data: { id: string; status: string }[] }>('/api/leave-requests?limit=500'),
    enabled: (perms.includes('LEAVES_APPROVE') || perms.includes('ADMIN')) && (open || !readState),
  });

  const { data: auditData } = useQuery({
    queryKey: ['notif-audit'],
    queryFn: () => apiGet<{ data: AuditLog[] }>('/api/audit-logs?limit=8'),
    enabled: (perms.includes('AUDIT_VIEW') || perms.includes('ADMIN')) && open,
  });

  const pendingList = pendingData?.data ?? [];
  const pendingCount = pendingList.filter((r) => r.status === 'PENDING').length;
  const auditLogs = auditData?.data ?? [];

  const unreadCount =
    pendingCount > 0 && readState != null
      ? Math.max(0, pendingCount - readState.countAtDismiss)
      : pendingCount;

  const markAllRead = () => {
    const next = { dismissedAt: Date.now(), countAtDismiss: pendingCount };
    setReadState(next);
    try {
      localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="الإشعارات"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden z-50">
          <div className="flex items-center justify-between p-3 border-b border-gray-100">
            <span className="font-semibold text-gray-900">الإشعارات</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <CheckCheck className="h-4 w-4" />
                تعليم الكل كمقروء
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {pendingCount > 0 && (
              <Link
                href="/dashboard/leaves?status=PENDING"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-50"
              >
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Calendar className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{pendingCount} طلب إجازة قيد الانتظار</p>
                  <p className="text-sm text-gray-500">انقر للانتقال إلى الصفحة</p>
                </div>
              </Link>
            )}
            {auditLogs.map((log) => {
              const href = getAuditLink(log);
              return (
                <Link
                  key={log.id}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                >
                  <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {actionLabels[log.action] || log.action}
                    </p>
                    <p className="text-xs text-gray-500">
                      {log.user?.name} • {new Date(log.createdAt).toLocaleString('ar-EG')}
                    </p>
                  </div>
                </Link>
              );
            })}
            {pendingCount === 0 && auditLogs.length === 0 && (
              <div className="p-6 text-center text-gray-500 text-sm">لا توجد إشعارات</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
