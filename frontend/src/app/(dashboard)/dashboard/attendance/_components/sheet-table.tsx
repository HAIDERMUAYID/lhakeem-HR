'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import { clockFrom24, hospitalClock } from '@/lib/hospital-clock';
import {
  formatMinutes,
  isPresentLike,
  weekdayName,
  type RosterRow,
  type RowSortKey,
  type SortDir,
} from '@/lib/attendance-stats';
import { StatusBadge } from './status-badge';

export type ColumnKey = 'id' | 'job' | 'unit' | 'duty' | 'expected' | 'worked' | 'late' | 'early' | 'overtime';

const COLUMN_LABELS: Record<ColumnKey, string> = {
  id: 'المعرف',
  job: 'العنوان الوظيفي',
  unit: 'الوحدة',
  duty: 'الدوام المطلوب',
  expected: 'ساعات الدوام',
  worked: 'العمل الفعلي',
  late: 'التأخير',
  early: 'الانصراف المبكر',
  overtime: 'الإضافي',
};

export const DEFAULT_COLUMNS: ColumnKey[] = ['id', 'job', 'unit', 'duty', 'expected', 'worked', 'late', 'overtime'];
const PAGE_SIZES = [50, 100, 250, 500];

function SortHead({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: RowSortKey;
  active: RowSortKey;
  dir: SortDir;
  onSort: (key: RowSortKey) => void;
  className?: string;
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`sticky top-0 z-10 bg-white px-3 py-2.5 font-medium ${className}`} aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-gray-100 ${isActive ? 'text-primary-800' : ''}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${isActive ? '' : 'opacity-40'}`} />
      </button>
    </th>
  );
}

export function ColumnPicker({ visible, onChange }: { visible: ColumnKey[]; onChange: (next: ColumnKey[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
      >
        <Columns3 className="h-4 w-4" />
        الأعمدة
      </button>
      {open && (
        <>
          <button type="button" aria-label="إغلاق" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-11 z-30 w-52 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl">
            {DEFAULT_COLUMNS.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={visible.includes(key)}
                  onChange={(e) =>
                    onChange(e.target.checked ? DEFAULT_COLUMNS.filter((c) => c === key || visible.includes(c)) : visible.filter((c) => c !== key))
                  }
                />
                {COLUMN_LABELS[key]}
              </label>
            ))}
            <button
              type="button"
              className="mt-1 w-full rounded-lg px-2 py-1.5 text-start text-xs text-primary-700 hover:bg-primary-50"
              onClick={() => onChange(DEFAULT_COLUMNS)}
            >
              إظهار الكل
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function SheetTable({
  rows,
  visible,
  sortKey,
  sortDir,
  onSort,
  onSelect,
  resetKey,
  multiDay,
  today,
}: {
  rows: RosterRow[];
  visible: ColumnKey[];
  sortKey: RowSortKey;
  sortDir: SortDir;
  onSort: (key: RowSortKey) => void;
  onSelect: (row: RosterRow) => void;
  resetKey: string;
  multiDay: boolean;
  today: string;
}) {
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem('att.pageSize'));
    if (PAGE_SIZES.includes(saved)) setPageSize(saved);
  }, []);
  useEffect(() => setPage(0), [resetKey, pageSize]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const slice = useMemo(() => rows.slice(current * pageSize, current * pageSize + pageSize), [rows, current, pageSize]);
  const has = (key: ColumnKey) => visible.includes(key);

  return (
    <div>
      <div className="max-h-[68vh] overflow-auto rounded-2xl border border-gray-100">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-right text-gray-500">
              <SortHead label="التاريخ" sortKey="date" active={sortKey} dir={sortDir} onSort={onSort} />
              {has('id') && <th className="sticky top-0 z-10 bg-white px-3 py-2.5 font-medium">المعرف</th>}
              <SortHead label="الاسم" sortKey="name" active={sortKey} dir={sortDir} onSort={onSort} />
              {has('job') && <th className="sticky top-0 z-10 bg-white px-3 py-2.5 font-medium">العنوان الوظيفي</th>}
              {has('unit') && <th className="sticky top-0 z-10 bg-white px-3 py-2.5 font-medium">الوحدة</th>}
              {has('duty') && <th className="sticky top-0 z-10 bg-white px-3 py-2.5 font-medium">الدوام المطلوب</th>}
              <SortHead label="حضور" sortKey="checkIn" active={sortKey} dir={sortDir} onSort={onSort} />
              <SortHead label="انصراف" sortKey="checkOut" active={sortKey} dir={sortDir} onSort={onSort} />
              {has('expected') && <th className="sticky top-0 z-10 bg-white px-3 py-2.5 font-medium">ساعات الدوام</th>}
              {has('worked') && <SortHead label="العمل الفعلي" sortKey="worked" active={sortKey} dir={sortDir} onSort={onSort} />}
              {has('late') && <SortHead label="التأخير" sortKey="late" active={sortKey} dir={sortDir} onSort={onSort} />}
              {has('early') && <th className="sticky top-0 z-10 bg-white px-3 py-2.5 font-medium">مبكر</th>}
              {has('overtime') && <SortHead label="الإضافي" sortKey="overtime" active={sortKey} dir={sortDir} onSort={onSort} />}
              <SortHead label="الحالة" sortKey="status" active={sortKey} dir={sortDir} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {slice.map((row, index) => {
              const off = row.status === 'REST' || row.status === 'LEAVE' || row.status === 'HOLIDAY';
              const isToday = row.workDate === today;
              const newDay = multiDay && index > 0 && slice[index - 1].workDate !== row.workDate;
              return (
                <tr
                  key={`${row.employeeId}-${row.workDate}`}
                  onClick={() => onSelect(row)}
                  className={`cursor-pointer border-b last:border-0 hover:bg-primary-50/40 ${newDay ? 'border-t-2 border-t-gray-200' : ''} ${
                    row.status === 'ABSENT' ? 'bg-red-50/30' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="font-mono">{row.workDate}</div>
                    <div className={`text-xs ${isToday ? 'font-semibold text-primary-700' : 'text-gray-500'}`}>
                      {isToday ? 'اليوم · ' : ''}
                      {weekdayName(row.workDate)}
                    </div>
                  </td>
                  {has('id') && <td className="px-3 py-2 font-mono">{row.fingerprintId}</td>}
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{row.employeeName}</div>
                    {!has('job') && <div className="text-xs text-gray-500">{row.jobTitle}</div>}
                  </td>
                  {has('job') && <td className="px-3 py-2 text-xs text-gray-600">{row.jobTitle || '—'}</td>}
                  {has('unit') && <td className="px-3 py-2">{row.unitName || '—'}</td>}
                  {has('duty') && (
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {off ? '—' : row.scheduledStart && row.scheduledEnd ? `${clockFrom24(row.scheduledStart)} – ${clockFrom24(row.scheduledEnd)}` : (
                        <span className="text-orange-700">بلا جدول</span>
                      )}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{hospitalClock(row.checkInAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono">{hospitalClock(row.checkOutAt)}</td>
                  {has('expected') && <td className="px-3 py-2">{formatMinutes(row.expectedMinutes)}</td>}
                  {has('worked') && <td className="px-3 py-2">{formatMinutes(row.workedMinutes)}</td>}
                  {has('late') && (
                    <td className="px-3 py-2">
                      <span className={row.lateMinutes > 0 && isPresentLike(row) ? 'font-semibold text-orange-700' : ''}>
                        {formatMinutes(row.lateMinutes)}
                      </span>
                      {!has('early') && row.earlyLeaveMinutes > 0 && isPresentLike(row) && (
                        <div className="text-[11px] text-orange-700">مبكر {formatMinutes(row.earlyLeaveMinutes)}</div>
                      )}
                    </td>
                  )}
                  {has('early') && (
                    <td className="px-3 py-2">
                      <span className={row.earlyLeaveMinutes > 0 && isPresentLike(row) ? 'font-semibold text-orange-700' : ''}>
                        {formatMinutes(row.earlyLeaveMinutes)}
                      </span>
                    </td>
                  )}
                  {has('overtime') && (
                    <td className="px-3 py-2">
                      <span className={row.overtimeMinutes > 0 ? 'font-semibold text-emerald-700' : ''}>{formatMinutes(row.overtimeMinutes)}</span>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <StatusBadge row={row} />
                  </td>
                </tr>
              );
            })}
            {!slice.length && (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-gray-500">
                  لا توجد نتائج مطابقة للفلاتر الحالية.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <span>
          عرض {rows.length ? current * pageSize + 1 : 0}–{Math.min(rows.length, (current + 1) * pageSize)} من {rows.length}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            صفوف/صفحة
            <select
              className="h-8 rounded-lg border border-gray-200 bg-white px-2"
              value={pageSize}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPageSize(next);
                window.localStorage.setItem('att.pageSize', String(next));
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={current <= 0}
            onClick={() => setPage(current - 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"
            aria-label="السابق"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="tabular-nums">{current + 1} / {pageCount}</span>
          <button
            type="button"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"
            aria-label="التالي"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
