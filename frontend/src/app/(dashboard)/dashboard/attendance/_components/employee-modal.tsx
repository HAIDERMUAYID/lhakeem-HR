'use client';

import { useMemo } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { downloadAttendanceExcel } from '@/lib/attendance-excel';
import { printAttendanceSheet } from '@/lib/attendance-print';
import { clockFrom24, hospitalClock, hospitalDateKey } from '@/lib/hospital-clock';
import {
  formatMinutes,
  summarizeRows,
  weekdayName,
  type PunchLogRow,
  type RosterRow,
} from '@/lib/attendance-stats';
import { StatusBadge } from './status-badge';

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-base font-bold tabular-nums ${tone ?? 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

export function EmployeeModal({
  employeeId,
  onClose,
  rows,
  punches,
  deviceName,
  serial,
  departmentName,
  fromDate,
  toDate,
}: {
  employeeId: string | null;
  onClose: () => void;
  rows: RosterRow[];
  punches: PunchLogRow[];
  deviceName: string;
  serial: string;
  departmentName: string | null;
  fromDate: string;
  toDate: string;
}) {
  const employeeRows = useMemo(
    () => rows.filter((row) => row.employeeId === employeeId).sort((a, b) => a.workDate.localeCompare(b.workDate)),
    [rows, employeeId],
  );
  const first = employeeRows[0];
  const summary = useMemo(() => summarizeRows(employeeRows), [employeeRows]);
  const punchesByDay = useMemo(() => {
    if (!first) return [] as Array<[string, PunchLogRow[]]>;
    const map = new Map<string, PunchLogRow[]>();
    for (const punch of punches) {
      if (punch.fingerprintId !== first.fingerprintId) continue;
      const key = hospitalDateKey(punch.scannedAt);
      map.set(key, [...(map.get(key) ?? []), punch]);
    }
    return [...map.entries()]
      .map(([key, list]) => [key, list.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))] as [string, PunchLogRow[]])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [punches, first]);

  return (
    <Modal open={Boolean(employeeId)} onClose={onClose} title={first?.employeeName ?? 'تفاصيل الموظف'} className="max-w-4xl">
      {first && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {first.jobTitle}
              {first.unitName ? ` · ${first.unitName}` : ''}
              {first.departmentName ? ` · ${first.departmentName}` : ''} · معرف{' '}
              <span className="font-mono font-semibold">{first.fingerprintId}</span>
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1"
                onClick={() => {
                  const ok = printAttendanceSheet({ deviceName, serial, departmentName, fromDate, toDate, rows: employeeRows });
                  if (!ok) toast.error('المتصفح منع نافذة الطباعة');
                }}
              >
                <Printer className="h-4 w-4" />
                طباعة
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => downloadAttendanceExcel({ deviceName, fromDate, toDate, rows: employeeRows })}
              >
                <FileSpreadsheet className="h-4 w-4" />
                إكسل
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="أيام الحضور" value={summary.present} tone="text-emerald-700" />
            <Stat label="مرات التأخير" value={summary.late} tone={summary.late ? 'text-orange-700' : undefined} />
            <Stat label="الغياب" value={summary.absent} tone={summary.absent ? 'text-red-700' : undefined} />
            <Stat label="الإجازات" value={summary.leave} />
            <Stat label="مجموع التأخير" value={formatMinutes(summary.lateMinutes, '0')} />
            <Stat label="نسبة الحضور" value={summary.attendanceRate == null ? '—' : `${summary.attendanceRate}%`} />
          </div>

          <div className="max-h-[36vh] overflow-auto rounded-2xl border border-gray-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-right text-gray-500">
                  {['التاريخ', 'الدوام', 'حضور', 'انصراف', 'الفعلي', 'تأخير', 'إضافي', 'الحالة'].map((h) => (
                    <th key={h} className="sticky top-0 bg-white px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employeeRows.map((row) => (
                  <tr key={row.workDate} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="font-mono">{row.workDate}</span>
                      <span className="ms-2 text-xs text-gray-500">{weekdayName(row.workDate)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {row.scheduledStart && row.scheduledEnd && !['REST', 'LEAVE', 'HOLIDAY'].includes(row.status)
                        ? `${clockFrom24(row.scheduledStart)} – ${clockFrom24(row.scheduledEnd)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono">{hospitalClock(row.checkInAt)}</td>
                    <td className="px-3 py-2 font-mono">{hospitalClock(row.checkOutAt)}</td>
                    <td className="px-3 py-2">{formatMinutes(row.workedMinutes)}</td>
                    <td className={`px-3 py-2 ${row.lateMinutes > 0 ? 'font-semibold text-orange-700' : ''}`}>{formatMinutes(row.lateMinutes)}</td>
                    <td className={`px-3 py-2 ${row.overtimeMinutes > 0 ? 'font-semibold text-emerald-700' : ''}`}>{formatMinutes(row.overtimeMinutes)}</td>
                    <td className="px-3 py-2"><StatusBadge row={row} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">البصمات الخام</h3>
            {!punchesByDay.length ? (
              <p className="text-sm text-gray-500">لا توجد بصمات في هذه الفترة.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {punchesByDay.map(([day, list]) => (
                  <div key={day} className="rounded-xl border border-gray-100 px-3 py-2">
                    <p className="mb-1 text-xs text-gray-500">
                      <span className="font-mono">{day}</span> · {weekdayName(day)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((p, i) => (
                        <span key={`${p.scannedAt}-${i}`} className="rounded-lg bg-gray-100 px-2 py-0.5 font-mono text-xs">
                          {hospitalClock(p.scannedAt, true)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
