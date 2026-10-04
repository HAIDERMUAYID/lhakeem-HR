'use client';

import { weekdayName, type RowsSummary } from '@/lib/attendance-stats';

export function DayStrip({
  days,
  fromDate,
  toDate,
  today,
  byDay,
  onPick,
  onRestore,
}: {
  days: string[];
  fromDate: string;
  toDate: string;
  today: string;
  byDay: Map<string, RowsSummary>;
  onPick: (date: string) => void;
  onRestore?: () => void;
}) {
  if (days.length <= 1 || days.length > 62) return null;
  const single = fromDate === toDate;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">اضغط يوماً لفتح كشفه، أو عد للنطاق الكامل.</p>
        {single && onRestore ? (
          <button type="button" onClick={onRestore} className="text-xs font-medium text-primary-700 hover:underline">
            عرض النطاق كاملاً
          </button>
        ) : null}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map((day) => {
          const summary = byDay.get(day);
          const active = fromDate === day && toDate === day;
          const required = (summary?.present ?? 0) + (summary?.absent ?? 0);
          const rate = summary?.attendanceRate;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              className={`min-w-[4.6rem] rounded-2xl border px-2.5 py-2 text-center transition ${
                active
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : day === today
                    ? 'border-primary-200 bg-primary-50 text-primary-900'
                    : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
              }`}
            >
              <div className="text-[11px] opacity-80">{weekdayName(day)}</div>
              <div className="font-mono text-sm font-semibold">{day.slice(8)}</div>
              <div className={`mt-1 text-[10px] ${active ? 'text-white/80' : 'text-gray-500'}`}>
                {rate == null ? '—' : `${rate}%`}
                {required ? ` · ${summary?.absent ?? 0} غ` : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
