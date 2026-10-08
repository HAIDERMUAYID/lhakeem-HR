'use client';

import { FileSpreadsheet, Printer } from 'lucide-react';
import { hospitalClock } from '@/lib/hospital-clock';
import {
  EXCEPTION_LABEL,
  formatMinutes,
  weekdayName,
  type ExceptionKind,
  type RosterRow,
} from '@/lib/attendance-stats';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CanDo } from '@/components/shared/can-do';
import { StatusBadge } from './status-badge';

const ORDER: ExceptionKind[] = ['absent', 'single', 'late', 'early', 'noschedule'];

export function ExceptionsBoard({
  groups,
  onSelect,
  onPrint,
  onExcel,
}: {
  groups: Record<ExceptionKind, RosterRow[]>;
  onSelect: (row: RosterRow) => void;
  onPrint: (rows: RosterRow[]) => void;
  onExcel: (rows: RosterRow[]) => void;
}) {
  const all = ORDER.flatMap((kind) => groups[kind]);
  const unique = new Set(all.map((row) => `${row.employeeId}|${row.workDate}`)).size;

  if (!unique) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-gray-500">
          لا توجد حالات تحتاج متابعة في النطاق والفلاتر الحالية.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="font-semibold text-gray-900">لوحة المتابعة</h2>
            <p className="text-sm text-gray-600">
              {unique} سجل يحتاج تدخلاً: غياب، بصمة واحدة، تأخير، انصراف مبكر، أو بلا جدول.
            </p>
          </div>
          <CanDo permission="ATTENDANCE_EXPORT">
            <div className="flex gap-2">
              <Button size="sm" className="gap-1" onClick={() => onPrint(all)}>
                <Printer className="h-4 w-4" />
                طباعة الاستثناءات
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onExcel(all)}>
                <FileSpreadsheet className="h-4 w-4" />
                إكسل
              </Button>
            </div>
          </CanDo>
        </CardContent>
      </Card>

      {ORDER.map((kind) => {
        const rows = groups[kind];
        if (!rows.length) return null;
        return (
          <Card key={kind}>
            <CardContent className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-gray-900">
                  {EXCEPTION_LABEL[kind]}
                  <span className="ms-2 text-sm font-normal text-gray-500">{rows.length}</span>
                </h3>
              </div>
              <div className="max-h-[42vh] overflow-auto rounded-2xl border border-gray-100">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-right text-gray-500">
                      {['التاريخ', 'الموظف', 'الحضور', 'الانصراف', 'التفصيل', 'الحالة'].map((label) => (
                        <th key={label} className="sticky top-0 bg-white px-3 py-2 font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={`${kind}-${row.employeeId}-${row.workDate}`}
                        onClick={() => onSelect(row)}
                        className="cursor-pointer border-b last:border-0 hover:bg-primary-50/40"
                      >
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="font-mono">{row.workDate}</div>
                          <div className="text-xs text-gray-500">{weekdayName(row.workDate)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.employeeName}</div>
                          <div className="text-xs text-gray-500">
                            {row.jobTitle}
                            {row.unitName ? ` · ${row.unitName}` : ''} · {row.fingerprintId}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono">{hospitalClock(row.checkInAt)}</td>
                        <td className="px-3 py-2 font-mono">{hospitalClock(row.checkOutAt)}</td>
                        <td className="px-3 py-2 text-xs">
                          {kind === 'late' ? `تأخير ${formatMinutes(row.lateMinutes)}` : null}
                          {kind === 'early' ? `مبكر ${formatMinutes(row.earlyLeaveMinutes)}` : null}
                          {kind === 'single' ? 'حضور أو انصراف ناقص' : null}
                          {kind === 'absent' ? 'لم تُسجَّل بصمة في يوم دوام' : null}
                          {kind === 'noschedule' ? 'لا يوجد جدول دوام لهذا اليوم' : null}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge row={row} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
