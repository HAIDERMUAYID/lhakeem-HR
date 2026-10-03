/** أول بصمة في اليوم = حضور، آخر بصمة = انصراف. فرق أقل من ساعتين = بصمة واحدة في الكشف. */

export const MIN_PAIR_MINUTES = 120;

export type PunchLog = {
  deviceEmployeeCode: string;
  employeeId: string;
  scannedAt: Date;
};

export type DailyAttendanceRow = {
  employeeId: string;
  workDate: Date;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number | null;
  isValid: boolean;
  validationReason: string | null;
  displayMode: 'pair' | 'single';
  punchCount: number;
};

export function parseAttlogTimestamp(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseAttlogBody(body: string): { pin: string; scannedAt: Date }[] {
  const out: { pin: string; scannedAt: Date }[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/);
    if (!m) continue;
    const scannedAt = parseAttlogTimestamp(m[2]);
    if (!scannedAt) continue;
    out.push({ pin: m[1], scannedAt });
  }
  return out;
}

export function looksLikeHardwareSerial(code?: string | null): boolean {
  return Boolean(code && /^[A-Za-z0-9]{10,20}$/.test(code.trim()));
}

export function serialFromQuery(rawQuery: string | null | undefined): string | undefined {
  if (!rawQuery) return undefined;
  const value = new URLSearchParams(rawQuery).get('SN')?.trim();
  return value && value.length > 0 ? value : undefined;
}

function classifySingle(at: Date): Pick<DailyAttendanceRow, 'checkInAt' | 'checkOutAt' | 'validationReason'> {
  const hour = at.getHours();
  if (hour < 12) {
    return { checkInAt: at, checkOutAt: null, validationReason: 'بصمة واحدة' };
  }
  return { checkInAt: null, checkOutAt: at, validationReason: 'بصمة واحدة' };
}

export function computeDailyAttendance(logs: PunchLog[]): DailyAttendanceRow[] {
  const grouped = new Map<string, { employeeId: string; logs: Date[] }>();
  for (const log of logs) {
    const day = new Date(log.scannedAt);
    day.setHours(0, 0, 0, 0);
    const key = `${log.employeeId}|${day.toISOString()}`;
    const ex = grouped.get(key);
    if (!ex) grouped.set(key, { employeeId: log.employeeId, logs: [log.scannedAt] });
    else ex.logs.push(log.scannedAt);
  }

  const dailyRows: DailyAttendanceRow[] = [];
  for (const [, group] of grouped.entries()) {
    const sorted = [...group.logs].sort((a, b) => a.getTime() - b.getTime());
    const first = sorted[0];
    if (!first) continue;
    const workDate = new Date(first);
    workDate.setHours(0, 0, 0, 0);
    const punchCount = sorted.length;

    if (sorted.length === 1) {
      dailyRows.push({
        employeeId: group.employeeId,
        workDate,
        ...classifySingle(first),
        workedMinutes: null,
        isValid: true,
        displayMode: 'single',
        punchCount,
      });
      continue;
    }

    const last = sorted[sorted.length - 1]!;
    const workedMinutes = Math.floor((last.getTime() - first.getTime()) / 60000);
    if (workedMinutes < MIN_PAIR_MINUTES) {
      dailyRows.push({
        employeeId: group.employeeId,
        workDate,
        ...classifySingle(first),
        workedMinutes,
        isValid: true,
        displayMode: 'single',
        punchCount,
      });
      continue;
    }

    dailyRows.push({
      employeeId: group.employeeId,
      workDate,
      checkInAt: first,
      checkOutAt: last,
      workedMinutes,
      isValid: true,
      validationReason: null,
      displayMode: 'pair',
      punchCount,
    });
  }
  return dailyRows;
}
