'use client';

import { hospitalClock } from '@/lib/hospital-clock';
import { formatMinutes, isInside, type RosterRow } from '@/lib/attendance-stats';
import { Card, CardContent } from '@/components/ui/card';

export function OpsStrip({
  todayRows,
  unmatched,
  onFilter,
  onOpenUnmatched,
}: {
  todayRows: RosterRow[];
  unmatched: number;
  onFilter: (status: 'inside' | 'single' | 'absent' | 'late') => void;
  onOpenUnmatched: () => void;
}) {
  const inside = todayRows.filter(isInside);
  const single = todayRows.filter((row) => row.status === 'SINGLE');
  const absent = todayRows.filter((row) => row.status === 'ABSENT');
  const late = todayRows.filter((row) => row.lateMinutes > 0 && (row.status === 'PRESENT' || row.status === 'SINGLE'));

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-gray-900">متابعة اليوم</h2>
            <p className="text-xs text-gray-500">من حضر، من لم ينصرف، ومن يحتاج تدخلاً الآن.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <button type="button" onClick={() => onFilter('inside')} className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-right">
            <p className="text-xs text-emerald-800">ما زال في العمل</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">{inside.length}</p>
          </button>
          <button type="button" onClick={() => onFilter('single')} className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 text-right">
            <p className="text-xs text-sky-800">بصمة واحدة</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-sky-900">{single.length}</p>
          </button>
          <button type="button" onClick={() => onFilter('absent')} className="rounded-2xl border border-red-100 bg-red-50/70 p-3 text-right">
            <p className="text-xs text-red-800">غائب اليوم</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-red-900">{absent.length}</p>
          </button>
          <button type="button" onClick={onOpenUnmatched} className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3 text-right">
            <p className="text-xs text-amber-800">معرفات بلا موظف</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-amber-900">{unmatched}</p>
          </button>
        </div>
        {inside.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {inside.slice(0, 10).map((row) => (
              <span key={row.employeeId} className="rounded-full bg-white px-2.5 py-1 text-xs text-gray-700 ring-1 ring-gray-200">
                {row.employeeName}
                <span className="ms-1 font-mono text-[11px] text-gray-500">{hospitalClock(row.checkInAt, false, 'mark')}</span>
              </span>
            ))}
            {inside.length > 10 ? <span className="px-2 py-1 text-xs text-gray-500">+{inside.length - 10}</span> : null}
          </div>
        )}
        {late.length > 0 && (
          <p className="text-xs text-orange-800">
            {late.length} حالة تأخير اليوم · مجموع {formatMinutes(late.reduce((sum, row) => sum + row.lateMinutes, 0))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
