'use client';

import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { hospitalDateTime } from '@/lib/hospital-clock';
import { relativeAgo, type PunchLogRow } from '@/lib/attendance-stats';

export function DeviceStatus({
  punches,
  includesToday,
  updatedAt,
  fetching,
  autoRefresh,
  onToggleAuto,
}: {
  punches: PunchLogRow[];
  includesToday: boolean;
  updatedAt: number;
  fetching: boolean;
  autoRefresh: boolean;
  onToggleAuto: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const last = useMemo(() => {
    let best: string | null = null;
    for (const p of punches) if (!best || p.scannedAt > best) best = p.scannedAt;
    return best;
  }, [punches]);

  const ageMin = last ? Math.floor((now - new Date(last).getTime()) / 60_000) : null;
  const level: 'live' | 'ok' | 'stale' | 'none' =
    !last ? 'none' : !includesToday ? 'ok' : ageMin! < 20 ? 'live' : ageMin! < 360 ? 'ok' : 'stale';

  const palette = {
    live: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    ok: 'border-gray-200 bg-white text-gray-700',
    stale: 'border-amber-200 bg-amber-50 text-amber-900',
    none: 'border-gray-200 bg-white text-gray-600',
  }[level];

  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border px-4 py-2.5 text-sm ${palette}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          {level === 'live' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
              level === 'live' ? 'bg-emerald-500' : level === 'stale' ? 'bg-amber-500' : 'bg-gray-400'
            }`}
          />
        </span>
        {last ? (
          <span>
            آخر بصمة في هذه الفترة: <b>{relativeAgo(last, now)}</b>
            <span className="ms-1 font-mono text-xs opacity-70">({hospitalDateTime(last)})</span>
          </span>
        ) : (
          <span>لا توجد بصمات ضمن هذه الفترة.</span>
        )}
        {level === 'stale' && <span className="font-medium">— لم تصل بصمات حديثة، تحقق من اتصال الجهاز بالشبكة.</span>}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="opacity-70">
          آخر تحديث للصفحة {updatedAt ? new Date(updatedAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
          {fetching ? ' · جاري التحديث…' : ''}
        </span>
        <button
          type="button"
          onClick={onToggleAuto}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
            autoRefresh ? 'border-emerald-300 bg-white text-emerald-800' : 'border-gray-300 bg-white text-gray-600'
          }`}
        >
          <Radio className="h-3 w-3" />
          تحديث تلقائي: {autoRefresh ? 'مفعّل' : 'متوقف'}
        </button>
      </div>
    </div>
  );
}
