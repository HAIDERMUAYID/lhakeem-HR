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

export function hospitalClock(iso: string | null | undefined, withSeconds = false) {
  if (!iso) return '—';
  const list = parts(iso, withSeconds);
  if (!list) return '—';
  const hm = `${pick(list, 'hour')}:${pick(list, 'minute')}`;
  return withSeconds ? `${hm}:${pick(list, 'second')}` : hm;
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
