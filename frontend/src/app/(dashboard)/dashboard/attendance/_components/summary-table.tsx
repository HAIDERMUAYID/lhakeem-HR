'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { formatMinutes, type EmployeeSummary } from '@/lib/attendance-stats';

type Key =
  | 'employeeName'
  | 'present'
  | 'late'
  | 'absent'
  | 'leave'
  | 'single'
  | 'lateMinutes'
  | 'overtimeMinutes'
  | 'workedMinutes'
  | 'attendanceRate';

const COLUMNS: Array<{ key: Key; label: string }> = [
  { key: 'present', label: 'أيام الحضور' },
  { key: 'late', label: 'مرات التأخير' },
  { key: 'absent', label: 'الغياب' },
  { key: 'leave', label: 'الإجازات' },
  { key: 'single', label: 'بصمة واحدة' },
  { key: 'lateMinutes', label: 'مجموع التأخير' },
  { key: 'overtimeMinutes', label: 'الإضافي' },
  { key: 'workedMinutes', label: 'ساعات العمل' },
  { key: 'attendanceRate', label: 'نسبة الحضور' },
];

export function SummaryTable({
  items,
  onSelect,
}: {
  items: EmployeeSummary[];
  onSelect: (employeeId: string) => void;
}) {
  const [key, setKey] = useState<Key>('employeeName');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    const factor = dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, 'ar') * factor;
      return ((x as number) - (y as number)) * factor;
    });
  }, [items, key, dir]);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          present: acc.present + item.present,
          late: acc.late + item.late,
          absent: acc.absent + item.absent,
          leave: acc.leave + item.leave,
          single: acc.single + item.single,
          lateMinutes: acc.lateMinutes + item.lateMinutes,
          overtimeMinutes: acc.overtimeMinutes + item.overtimeMinutes,
          workedMinutes: acc.workedMinutes + item.workedMinutes,
        }),
        { present: 0, late: 0, absent: 0, leave: 0, single: 0, lateMinutes: 0, overtimeMinutes: 0, workedMinutes: 0 },
      ),
    [items],
  );

  const toggle = (next: Key) => {
    if (next === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setKey(next);
      setDir(next === 'employeeName' ? 'asc' : 'desc');
    }
  };

  const head = (k: Key, label: string) => {
    const active = key === k;
    const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th key={k} className="sticky top-0 z-10 whitespace-nowrap bg-white px-3 py-2.5 font-medium">
        <button
          type="button"
          onClick={() => toggle(k)}
          className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-gray-100 ${active ? 'text-primary-800' : ''}`}
        >
          {label}
          <Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} />
        </button>
      </th>
    );
  };

  if (!items.length) {
    return <p className="py-8 text-center text-sm text-gray-500">لا توجد بيانات للملخص ضمن الفلاتر الحالية.</p>;
  }

  return (
    <div className="max-h-[68vh] overflow-auto rounded-2xl border border-gray-100">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-right text-gray-500">
            <th className="sticky top-0 z-10 bg-white px-3 py-2.5 font-medium">#</th>
            {head('employeeName', 'الموظف')}
            {COLUMNS.map((c) => head(c.key, c.label))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, index) => {
            const rate = item.attendanceRate;
            return (
              <tr key={item.employeeId} onClick={() => onSelect(item.employeeId)} className="cursor-pointer border-b hover:bg-primary-50/40">
                <td className="px-3 py-2 text-xs text-gray-400">{index + 1}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{item.employeeName}</div>
                  <div className="text-xs text-gray-500">
                    {item.jobTitle}
                    {item.unitName ? ` · ${item.unitName}` : ''} · معرف {item.fingerprintId}
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums">{item.present}</td>
                <td className={`px-3 py-2 tabular-nums ${item.late ? 'font-semibold text-orange-700' : ''}`}>{item.late || '—'}</td>
                <td className={`px-3 py-2 tabular-nums ${item.absent ? 'font-semibold text-red-700' : ''}`}>{item.absent || '—'}</td>
                <td className="px-3 py-2 tabular-nums">{item.leave || '—'}</td>
                <td className="px-3 py-2 tabular-nums">{item.single || '—'}</td>
                <td className="px-3 py-2">{formatMinutes(item.lateMinutes)}</td>
                <td className="px-3 py-2">{formatMinutes(item.overtimeMinutes)}</td>
                <td className="px-3 py-2">{formatMinutes(item.workedMinutes)}</td>
                <td className="min-w-[110px] px-3 py-2">
                  {rate == null ? (
                    '—'
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={rate >= 90 ? 'h-full bg-emerald-500' : rate >= 75 ? 'h-full bg-orange-500' : 'h-full bg-red-500'}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums">{rate}%</span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="sticky bottom-0 bg-gray-50 font-semibold">
            <td className="px-3 py-2.5" />
            <td className="px-3 py-2.5">المجموع ({items.length} موظف)</td>
            <td className="px-3 py-2.5 tabular-nums">{totals.present}</td>
            <td className="px-3 py-2.5 tabular-nums">{totals.late}</td>
            <td className="px-3 py-2.5 tabular-nums">{totals.absent}</td>
            <td className="px-3 py-2.5 tabular-nums">{totals.leave}</td>
            <td className="px-3 py-2.5 tabular-nums">{totals.single}</td>
            <td className="px-3 py-2.5">{formatMinutes(totals.lateMinutes, '0')}</td>
            <td className="px-3 py-2.5">{formatMinutes(totals.overtimeMinutes, '0')}</td>
            <td className="px-3 py-2.5">{formatMinutes(totals.workedMinutes, '0')}</td>
            <td className="px-3 py-2.5" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
