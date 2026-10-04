const TZ = 'Asia/Baghdad';

function parts(iso: string, withSeconds: boolean) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).formatToParts(d);
}

function pick(list: Intl.DateTimeFormatPart[], type: string) {
  return list.find((part) => part.type === type)?.value ?? '00';
}

function to12(hour24: number, minute: string, second?: string, form: 'full' | 'mark' = 'full') {
  const period = hour24 < 12 ? (form === 'mark' ? 'ص' : 'صباحاً') : form === 'mark' ? 'م' : 'مساءً';
  const hour = hour24 % 12 || 12;
  const clock = second ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
  return `${clock} ${period}`;
}

export function clockFrom24(hhmm: string | null | undefined, form: 'full' | 'mark' = 'full') {
  if (!hhmm) return '—';
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return hhmm;
  return to12(Number(match[1]), match[2], undefined, form);
}

export function hospitalClock(iso: string | null | undefined, withSeconds = false, form: 'full' | 'mark' = 'full') {
  if (!iso) return '—';
  const list = parts(iso, withSeconds);
  if (!list) return '—';
  return to12(Number(pick(list, 'hour')), pick(list, 'minute'), withSeconds ? pick(list, 'second') : undefined, form);
}

export function hospitalDateKey(iso: string) {
  const list = parts(iso, false);
  if (!list) return iso.slice(0, 10);
  return `${pick(list, 'year')}-${pick(list, 'month')}-${pick(list, 'day')}`;
}

export function hospitalDateTime(iso: string) {
  const list = parts(iso, true);
  if (!list) return iso;
  return `${pick(list, 'year')}-${pick(list, 'month')}-${pick(list, 'day')} ${pick(list, 'hour')}:${pick(list, 'minute')}:${pick(list, 'second')}`;
}
