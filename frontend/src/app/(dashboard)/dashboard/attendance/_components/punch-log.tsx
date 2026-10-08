'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { hospitalClock, hospitalDateKey } from '@/lib/hospital-clock';
import { matchesPunch, relativeAgo, weekdayName, type PunchLogRow } from '@/lib/attendance-stats';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHasPermission } from '@/hooks/use-permissions';

type MatchFilter = 'all' | 'matched' | 'unmatched';

export function PunchLog({
  punches,
  freshKeys,
  live,
  onAssign,
  onSelectEmployee,
}: {
  punches: PunchLogRow[];
  freshKeys?: Set<string>;
  live?: boolean;
  onAssign: (pin: string) => void;
  onSelectEmployee: (employeeId: string) => void;
}) {
  const canAssign = useHasPermission('PINS_ASSIGN');
  const [query, setQuery] = useState('');
  const [match, setMatch] = useState<MatchFilter>('all');
  const [limit, setLimit] = useState(live ? 40 : 200);

  const filtered = useMemo(() => {
    return punches
      .filter((punch) => {
        if (match === 'matched' && !punch.matched) return false;
        if (match === 'unmatched' && punch.matched) return false;
        return matchesPunch(punch, query);
      })
      .slice()
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  }, [punches, match, query]);

  const visible = filtered.slice(0, limit);

  return (
    <Card className={live ? 'border-emerald-100 bg-emerald-50/30' : undefined}>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">{live ? 'البث المباشر' : 'سجل البصمات'}</h2>
            <p className="text-xs text-gray-500">
              {live ? 'آخر البصمات الواردة، مع تمييز غير المعرّفين.' : 'كل البصمات كما وصلت. الكشف يدمج البصمتين إذا كان الفرق أقل من ساعتين.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {([
              ['all', 'الكل'],
              ['matched', 'معرّفة'],
              ['unmatched', 'بلا موظف'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMatch(key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  match === key ? 'bg-primary-700 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input className="pr-10" placeholder="بحث بالاسم أو المعرف" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!filtered.length ? (
          <p className="py-6 text-center text-sm text-gray-500">لا توجد بصمات مطابقة.</p>
        ) : (
          <div className="max-h-[68vh] overflow-auto rounded-2xl border border-gray-100 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-right text-gray-500">
                  <th className="sticky top-0 bg-white px-3 py-2 font-medium">الوقت</th>
                  <th className="sticky top-0 bg-white px-3 py-2 font-medium">المعرف</th>
                  <th className="sticky top-0 bg-white px-3 py-2 font-medium">الاسم</th>
                  <th className="sticky top-0 bg-white px-3 py-2 font-medium">الوحدة</th>
                  <th className="sticky top-0 bg-white px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visible.map((punch, index) => {
                  const key = `${punch.fingerprintId}|${punch.scannedAt}`;
                  const isNew = freshKeys?.has(key);
                  const day = hospitalDateKey(punch.scannedAt);
                  return (
                    <tr key={`${key}-${index}`} className={`border-b last:border-0 ${isNew ? 'bg-emerald-50' : ''} ${punch.matched ? '' : 'bg-amber-50/40'}`}>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="font-mono">{hospitalClock(punch.scannedAt, true)}</div>
                        <div className="text-[11px] text-gray-500">
                          {day} · {weekdayName(day)} · {relativeAgo(punch.scannedAt)}
                          {isNew ? ' · جديد' : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold">{punch.fingerprintId}</td>
                      <td className="px-3 py-2">
                        {punch.matched && punch.employeeId ? (
                          <button type="button" className="font-medium text-primary-800 hover:underline" onClick={() => onSelectEmployee(punch.employeeId!)}>
                            {punch.employeeName}
                          </button>
                        ) : (
                          <span className="text-amber-800">غير معرف على هذا الجهاز</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{punch.unitName || '—'}</td>
                      <td className="px-3 py-2">
                        {!punch.matched && canAssign ? (
                          <Button size="sm" variant="outline" onClick={() => onAssign(punch.fingerprintId)}>
                            تعريف
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > visible.length && (
          <div className="text-center">
            <Button size="sm" variant="outline" onClick={() => setLimit((value) => value + 200)}>
              عرض المزيد ({filtered.length - visible.length} متبقٍ)
            </Button>
          </div>
        )}
        <p className="text-xs text-gray-500">
          {filtered.length} بصمة
          {query || match !== 'all' ? ` بعد التصفية من أصل ${punches.length}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}
