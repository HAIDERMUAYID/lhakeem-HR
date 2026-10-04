export type RosterStatus = 'PRESENT' | 'SINGLE' | 'ABSENT' | 'LEAVE' | 'REST' | 'HOLIDAY';

export type RosterRow = {
  employeeId: string;
  fingerprintId: string;
  employeeName: string;
  jobTitle: string;
  departmentName: string | null;
  unitName: string | null;
  workDate: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  expectedMinutes: number | null;
  workedMinutes: number | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  displayMode: 'pair' | 'single' | null;
  punchCount: number;
  status: RosterStatus;
  statusLabel: string;
};

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function weekdayName(date: string) {
  const parsed = new Date(`${date}T12:00:00+03:00`);
  return Number.isNaN(parsed.getTime()) ? '' : WEEKDAYS[parsed.getUTCDay()];
}

export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** تحويل الدقائق إلى صيغة مقروءة، مع تجميع الساعات الكبيرة. */
export function formatMinutes(mins: number | null | undefined, empty = '—') {
  if (mins == null || mins <= 0) return empty;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h <= 0) return `${m}د`;
  if (m === 0) return `${h}س`;
  return `${h}س ${m}د`;
}

/** توحيد النص العربي للبحث: الهمزات، التاء المربوطة، الألف المقصورة، التشكيل. */
export function normalizeArabic(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesQuery(row: Pick<RosterRow, 'employeeName' | 'fingerprintId' | 'jobTitle' | 'unitName'>, query: string) {
  const tokens = normalizeArabic(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalizeArabic(`${row.employeeName} ${row.fingerprintId} ${row.jobTitle} ${row.unitName ?? ''}`);
  return tokens.every((token) => haystack.includes(token));
}

export function isPresentLike(row: Pick<RosterRow, 'status'>) {
  return row.status === 'PRESENT' || row.status === 'SINGLE';
}

export function needsSchedule(row: RosterRow) {
  return (isPresentLike(row) || row.status === 'ABSENT') && !row.scheduledStart;
}

export type RowsSummary = {
  total: number;
  onTime: number;
  late: number;
  single: number;
  absent: number;
  leave: number;
  rest: number;
  present: number;
  overtimeCount: number;
  lateMinutes: number;
  overtimeMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  expectedMinutes: number;
  /** نسبة الحضور من الأيام المطلوب فيها الدوام (حاضر ÷ حاضر+غائب). */
  attendanceRate: number | null;
  /** نسبة الالتزام بالوقت من الحاضرين. */
  punctualityRate: number | null;
  needsSchedule: number;
  early: number;
  inside: number;
};

export function summarizeRows(rows: RosterRow[]): RowsSummary {
  const s: RowsSummary = {
    total: rows.length,
    onTime: 0,
    late: 0,
    single: 0,
    absent: 0,
    leave: 0,
    rest: 0,
    present: 0,
    overtimeCount: 0,
    lateMinutes: 0,
    overtimeMinutes: 0,
    earlyLeaveMinutes: 0,
    workedMinutes: 0,
    expectedMinutes: 0,
    attendanceRate: null,
    punctualityRate: null,
    needsSchedule: 0,
    early: 0,
    inside: 0,
  };
  for (const row of rows) {
    if (isPresentLike(row)) {
      s.present += 1;
      if (row.lateMinutes > 0) s.late += 1;
      else if (row.status === 'SINGLE') s.single += 1;
      else s.onTime += 1;
      if (row.earlyLeaveMinutes > 0) s.early += 1;
      if (row.checkInAt && !row.checkOutAt) s.inside += 1;
      s.workedMinutes += row.workedMinutes ?? 0;
      s.expectedMinutes += row.expectedMinutes ?? 0;
      s.lateMinutes += row.lateMinutes;
      s.earlyLeaveMinutes += row.earlyLeaveMinutes;
    } else if (row.status === 'ABSENT') s.absent += 1;
    else if (row.status === 'LEAVE') s.leave += 1;
    else s.rest += 1;
    if (row.overtimeMinutes > 0) {
      s.overtimeCount += 1;
      s.overtimeMinutes += row.overtimeMinutes;
    }
    if (needsSchedule(row)) s.needsSchedule += 1;
  }
  const required = s.present + s.absent;
  s.attendanceRate = required > 0 ? Math.round((s.present / required) * 1000) / 10 : null;
  s.punctualityRate = s.present > 0 ? Math.round(((s.present - s.late) / s.present) * 1000) / 10 : null;
  return s;
}

export type EmployeeSummary = {
  employeeId: string;
  fingerprintId: string;
  employeeName: string;
  jobTitle: string;
  departmentName: string | null;
  unitName: string | null;
  present: number;
  late: number;
  single: number;
  absent: number;
  leave: number;
  rest: number;
  lateMinutes: number;
  overtimeMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  expectedMinutes: number;
  attendanceRate: number | null;
};

export function summarizeByEmployee(rows: RosterRow[]): EmployeeSummary[] {
  const map = new Map<string, EmployeeSummary>();
  for (const row of rows) {
    let item = map.get(row.employeeId);
    if (!item) {
      item = {
        employeeId: row.employeeId,
        fingerprintId: row.fingerprintId,
        employeeName: row.employeeName,
        jobTitle: row.jobTitle,
        departmentName: row.departmentName,
        unitName: row.unitName,
        present: 0,
        late: 0,
        single: 0,
        absent: 0,
        leave: 0,
        rest: 0,
        lateMinutes: 0,
        overtimeMinutes: 0,
        earlyLeaveMinutes: 0,
        workedMinutes: 0,
        expectedMinutes: 0,
        attendanceRate: null,
      };
      map.set(row.employeeId, item);
    }
    if (isPresentLike(row)) {
      item.present += 1;
      if (row.lateMinutes > 0) item.late += 1;
      if (row.status === 'SINGLE') item.single += 1;
      item.lateMinutes += row.lateMinutes;
      item.earlyLeaveMinutes += row.earlyLeaveMinutes;
      item.workedMinutes += row.workedMinutes ?? 0;
      item.expectedMinutes += row.expectedMinutes ?? 0;
    } else if (row.status === 'ABSENT') item.absent += 1;
    else if (row.status === 'LEAVE') item.leave += 1;
    else item.rest += 1;
    item.overtimeMinutes += row.overtimeMinutes;
  }
  const list = [...map.values()];
  for (const item of list) {
    const required = item.present + item.absent;
    item.attendanceRate = required > 0 ? Math.round((item.present / required) * 1000) / 10 : null;
  }
  return list;
}

export type RowSortKey = 'none' | 'date' | 'name' | 'checkIn' | 'checkOut' | 'worked' | 'late' | 'overtime' | 'status';
export type SortDir = 'asc' | 'desc';

const STATUS_ORDER: Record<RosterStatus, number> = { ABSENT: 0, SINGLE: 1, PRESENT: 2, LEAVE: 3, REST: 4, HOLIDAY: 5 };

export function sortRows(rows: RosterRow[], key: RowSortKey, dir: SortDir) {
  if (key === 'none') return rows;
  const factor = dir === 'asc' ? 1 : -1;
  const time = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  const pick = (row: RosterRow): string | number | null => {
    switch (key) {
      case 'date':
        return row.workDate;
      case 'name':
        return row.employeeName;
      case 'checkIn':
        return time(row.checkInAt);
      case 'checkOut':
        return time(row.checkOutAt);
      case 'worked':
        return row.workedMinutes;
      case 'late':
        return row.lateMinutes;
      case 'overtime':
        return row.overtimeMinutes;
      case 'status':
        return STATUS_ORDER[row.status];
      default:
        return null;
    }
  };
  return [...rows].sort((a, b) => {
    const x = pick(a);
    const y = pick(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1; // الفارغ دائماً في النهاية
    if (y == null) return -1;
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, 'ar') * factor;
    return ((x as number) - (y as number)) * factor;
  });
}

/** "قبل 5 دقائق" / "قبل ساعتين" ... */
export function relativeAgo(iso: string | Date, now = Date.now()) {
  const t = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة${mins % 60 ? ` و${mins % 60} دقيقة` : ''}`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

export type PunchLogRow = {
  fingerprintId: string;
  scannedAt: string;
  employeeId: string | null;
  employeeName: string | null;
  unitName: string | null;
  matched: boolean;
};

export function isInside(row: Pick<RosterRow, 'status' | 'checkInAt' | 'checkOutAt'>) {
  return isPresentLike(row) && Boolean(row.checkInAt) && !row.checkOutAt;
}

export function isEarlyLeave(row: Pick<RosterRow, 'status' | 'earlyLeaveMinutes'>) {
  return isPresentLike(row) && row.earlyLeaveMinutes > 0;
}

export type ExceptionKind = 'absent' | 'single' | 'late' | 'early' | 'noschedule';

export function exceptionKinds(row: RosterRow): ExceptionKind[] {
  const kinds: ExceptionKind[] = [];
  if (row.status === 'ABSENT') kinds.push('absent');
  if (row.status === 'SINGLE') kinds.push('single');
  if (isPresentLike(row) && row.lateMinutes > 0) kinds.push('late');
  if (isEarlyLeave(row)) kinds.push('early');
  if (needsSchedule(row)) kinds.push('noschedule');
  return kinds;
}

export const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  absent: 'غياب',
  single: 'بصمة واحدة',
  late: 'تأخير',
  early: 'انصراف مبكر',
  noschedule: 'بلا جدول',
};

export function groupExceptions(rows: RosterRow[]) {
  const groups: Record<ExceptionKind, RosterRow[]> = {
    absent: [],
    single: [],
    late: [],
    early: [],
    noschedule: [],
  };
  for (const row of rows) {
    for (const kind of exceptionKinds(row)) groups[kind].push(row);
  }
  return groups;
}

export function exceptionCount(rows: RosterRow[]) {
  return rows.filter((row) => exceptionKinds(row).length > 0).length;
}

export function enumerateDays(from: string, to: string) {
  const days: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    days.push(cursor);
    cursor = shiftDate(cursor, 1);
    guard += 1;
  }
  return days;
}

export function summarizeByDay(rows: RosterRow[]) {
  const buckets = new Map<string, RosterRow[]>();
  for (const row of rows) {
    const list = buckets.get(row.workDate) ?? [];
    list.push(row);
    buckets.set(row.workDate, list);
  }
  const map = new Map<string, RowsSummary>();
  for (const [day, list] of buckets) map.set(day, summarizeRows(list));
  return map;
}

export function matchesPunch(punch: PunchLogRow, query: string) {
  const tokens = normalizeArabic(query).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalizeArabic(`${punch.employeeName ?? ''} ${punch.fingerprintId} ${punch.unitName ?? ''}`);
  return tokens.every((token) => haystack.includes(token));
}
