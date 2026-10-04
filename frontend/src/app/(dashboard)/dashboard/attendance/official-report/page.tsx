'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { fetchLiveDayRange } from '@/lib/live-day-range';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import {
  downloadAttendancePdf,
  rosterMatchesStatus,
  type AttendancePdfRow,
  type AttendanceStatusFilter,
} from '@/lib/attendance-pdf';

type LiveDay = {
  deviceName: string;
  serial: string;
  fromDate: string;
  toDate: string;
  deviceDepartment: { name: string; locked?: boolean } | null;
  roster: AttendancePdfRow[];
};

const STATUSES: AttendanceStatusFilter[] = ['all', 'present', 'late', 'absent', 'leave', 'rest', 'overtime', 'single'];

function isStatus(value: string | null): value is AttendanceStatusFilter {
  return STATUSES.includes(value as AttendanceStatusFilter);
}

function OfficialReportInner() {
  const params = useSearchParams();
  const deviceId = params.get('deviceId') || '';
  const fromDate = params.get('from') || '';
  const toDate = params.get('to') || '';
  const statusParam = params.get('status');
  const status: AttendanceStatusFilter = isStatus(statusParam) ? statusParam : 'all';
  const name = params.get('name') || '';
  const department = params.get('department') || '';
  const unit = params.get('unit') || '';
  const [pdfBusy, setPdfBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance-official', deviceId, fromDate, toDate],
    enabled: Boolean(deviceId && fromDate && toDate),
    queryFn: () => fetchLiveDayRange<LiveDay>(deviceId, fromDate, toDate),
  });

  const rows = (data?.roster ?? []).filter((row) => {
    if (name && !row.employeeName.includes(name) && !row.fingerprintId.includes(name) && !(row.jobTitle || '').includes(name)) return false;
    if (department && row.departmentName !== department) return false;
    if (unit && row.unitName !== unit) return false;
    return rosterMatchesStatus(row, status);
  });

  const download = () => {
    if (!data) return;
    setPdfBusy(true);
    void downloadAttendancePdf({
      layout: 'official',
      deviceName: data.deviceName,
      serial: data.serial,
      departmentName: data.deviceDepartment?.name ?? null,
      departmentLocked: Boolean(data.deviceDepartment?.locked),
      fromDate: data.fromDate,
      toDate: data.toDate,
      filters: { name, department, unit, status },
      rows,
    })
      .then(() => toast.success('تم تنزيل كشف الحضور'))
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'تعذر إنشاء الكشف'))
      .finally(() => setPdfBusy(false));
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-8" dir="rtl">
      <Link href="/dashboard/attendance" className="text-sm text-primary-700">
        العودة للحضور
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">كشف الحضور والانصراف</h1>
      <p className="text-sm text-gray-600">
        يُنزَّل ملف PDF مباشرة. الصفحات تُقسَّم على حدود الصفوف، والملخص والتواقيع في آخر الكشف، والصفوف هي نفس الفلاتر الممررة.
      </p>
      {!deviceId && <p className="text-sm text-gray-600">افتح الكشف من صفحة الحضور بعد اختيار الجهاز والفترة.</p>}
      {isLoading && <p className="text-sm text-gray-500">جاري تجهيز البيانات…</p>}
      {error && <p className="text-sm text-red-700">{(error as Error).message}</p>}
      {data && (
        <p className="text-sm text-gray-700">
          {data.deviceName} · {data.fromDate} إلى {data.toDate} · {rows.length} صف
        </p>
      )}
      <Button disabled={!data || pdfBusy} onClick={download} className="gap-2">
        <FileDown className="h-4 w-4" />
        {pdfBusy ? 'جاري إنشاء PDF…' : 'تحميل PDF'}
      </Button>
    </div>
  );
}

export default function AttendanceOfficialReportPage() {
  return (
    <Suspense fallback={<p className="p-8">جاري التحميل…</p>}>
      <OfficialReportInner />
    </Suspense>
  );
}
