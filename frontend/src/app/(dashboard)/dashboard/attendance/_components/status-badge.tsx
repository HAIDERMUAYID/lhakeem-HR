import { Badge } from '@/components/ui/badge';
import { isPresentLike, type RosterRow } from '@/lib/attendance-stats';

export function statusClass(row: Pick<RosterRow, 'status' | 'lateMinutes'>) {
  if (isPresentLike(row) && row.lateMinutes > 0) return 'bg-orange-50 text-orange-800';
  if (row.status === 'PRESENT') return 'bg-emerald-50 text-emerald-800';
  if (row.status === 'SINGLE') return 'bg-sky-50 text-sky-800';
  if (row.status === 'LEAVE') return 'bg-violet-50 text-violet-800';
  if (row.status === 'REST' || row.status === 'HOLIDAY') return 'bg-slate-100 text-slate-700';
  return 'bg-red-50 text-red-700';
}

export function StatusBadge({ row }: { row: Pick<RosterRow, 'status' | 'lateMinutes' | 'statusLabel'> }) {
  return <Badge className={`whitespace-nowrap ${statusClass(row)}`}>{row.statusLabel}</Badge>;
}
