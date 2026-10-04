import { Card, CardContent } from '@/components/ui/card';
import { formatMinutes, type RowsSummary } from '@/lib/attendance-stats';

const SEGMENTS: Array<{ key: keyof RowsSummary; label: string; color: string }> = [
  { key: 'onTime', label: 'في الوقت', color: 'bg-emerald-500' },
  { key: 'late', label: 'متأخر', color: 'bg-orange-500' },
  { key: 'single', label: 'بصمة واحدة', color: 'bg-sky-500' },
  { key: 'absent', label: 'غائب', color: 'bg-red-500' },
  { key: 'leave', label: 'إجازة', color: 'bg-violet-500' },
  { key: 'rest', label: 'استراحة / عطلة', color: 'bg-slate-300' },
];

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone ?? 'text-gray-900'}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function KpiStrip({ summary, days }: { summary: RowsSummary; days: number }) {
  const total = summary.total || 1;
  const rate = summary.attendanceRate;
  const punctual = summary.punctualityRate;
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="نسبة الحضور"
            value={rate == null ? '—' : `${rate}%`}
            hint={`${summary.present} حاضر من ${summary.present + summary.absent} يوم دوام`}
            tone={rate == null ? undefined : rate >= 90 ? 'text-emerald-700' : rate >= 75 ? 'text-orange-700' : 'text-red-700'}
          />
          <Kpi
            label="الالتزام بالوقت"
            value={punctual == null ? '—' : `${punctual}%`}
            hint={`${summary.late} حالة تأخير`}
            tone={punctual == null ? undefined : punctual >= 90 ? 'text-emerald-700' : 'text-orange-700'}
          />
          <Kpi
            label="مجموع التأخير"
            value={formatMinutes(summary.lateMinutes, '0')}
            hint={
              summary.early
                ? `انصراف مبكر ${formatMinutes(summary.earlyLeaveMinutes)} · ${summary.early} حالة`
                : summary.present
                  ? `بمعدل ${formatMinutes(Math.round(summary.lateMinutes / Math.max(summary.late, 1)), '0')} للحالة`
                  : undefined
            }
            tone={summary.lateMinutes > 0 ? 'text-orange-700' : undefined}
          />
          <Kpi
            label="ساعات العمل الفعلي"
            value={formatMinutes(summary.workedMinutes, '0')}
            hint={
              [
                summary.overtimeMinutes ? `إضافي ${formatMinutes(summary.overtimeMinutes)}` : '',
                summary.inside ? `${summary.inside} ما زال في العمل` : '',
                `${days} يوم`,
              ]
                .filter(Boolean)
                .join(' · ')
            }
          />
        </div>
        {summary.total > 0 && (
          <div>
            <div className="flex h-3 overflow-hidden rounded-full bg-gray-100" role="img" aria-label="توزيع الحالات">
              {SEGMENTS.map((segment) => {
                const value = summary[segment.key] as number;
                if (!value) return null;
                return (
                  <div
                    key={segment.key}
                    className={segment.color}
                    style={{ width: `${(value / total) * 100}%` }}
                    title={`${segment.label}: ${value}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              {SEGMENTS.map((segment) => {
                const value = summary[segment.key] as number;
                if (!value) return null;
                return (
                  <span key={segment.key} className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${segment.color}`} />
                    {segment.label}
                    <b className="tabular-nums text-gray-900">{value}</b>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
