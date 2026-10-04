import { clockFrom24, hospitalClock } from './hospital-clock';

export type AttendancePrintRow = {
  workDate: string;
  fingerprintId: string;
  employeeName: string;
  jobTitle: string;
  departmentName: string | null;
  unitName: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  expectedMinutes: number | null;
  workedMinutes: number | null;
  lateMinutes: number;
  overtimeMinutes: number;
  status: string;
  statusLabel: string;
};

export type AttendancePrintInput = {
  deviceName: string;
  serial: string;
  departmentName: string | null;
  fromDate: string;
  toDate: string;
  rows: AttendancePrintRow[];
};

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function duration(mins: number | null | undefined) {
  if (mins == null || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س ${m} د`;
}

function duty(row: AttendancePrintRow) {
  if (row.status === 'REST' || row.status === 'LEAVE' || row.status === 'HOLIDAY') return '';
  if (!row.scheduledStart || !row.scheduledEnd) return '';
  return `${clockFrom24(row.scheduledStart, 'mark')} – ${clockFrom24(row.scheduledEnd, 'mark')}`;
}

function weekday(date: string) {
  const parsed = new Date(`${date}T12:00:00+03:00`);
  return Number.isNaN(parsed.getTime()) ? '' : WEEKDAYS[parsed.getUTCDay()];
}

function issuedAt() {
  return new Intl.DateTimeFormat('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

function tone(status: string) {
  if (status === 'PRESENT') return 'ok';
  if (status === 'SINGLE') return 'single';
  if (status === 'ABSENT') return 'absent';
  if (status === 'LEAVE') return 'leave';
  if (status === 'REST' || status === 'HOLIDAY') return 'off';
  return 'none';
}

/* ───────── تقسيم الصفحات يدوياً (لا نعتمد على المتصفح في كسر الجدول) ───────── */
const ROWS_FIRST = 23;
const ROWS_NEXT = 31;
const ROWS_SIGN_RESERVE = 5;

function paginate<T>(items: T[]): T[][] {
  const pages: T[][] = [];
  let cursor = 0;
  while (cursor < items.length) {
    const cap = pages.length === 0 ? ROWS_FIRST : ROWS_NEXT;
    pages.push(items.slice(cursor, cursor + cap));
    cursor += cap;
  }
  if (pages.length === 0) pages.push([]);
  const lastIndex = pages.length - 1;
  const lastCap = (lastIndex === 0 ? ROWS_FIRST : ROWS_NEXT) - ROWS_SIGN_RESERVE;
  const last = pages[lastIndex];
  if (last.length > lastCap) {
    pages[lastIndex] = last.slice(0, lastCap);
    pages.push(last.slice(lastCap));
  }
  return pages;
}

export function buildAttendancePrintHtml(
  input: AttendancePrintInput,
  origin: string,
  options: { autoPrint?: boolean } = {},
) {
  const rows = input.rows;
  const counted = (row: AttendancePrintRow) => row.status === 'PRESENT' || row.status === 'SINGLE';
  const stats: Array<[string, number, string]> = [
    ['إجمالي السجلات', rows.length, ''],
    ['حاضر', rows.filter(counted).length, ''],
    ['متأخر', rows.filter((row) => counted(row) && row.lateMinutes > 0).length, ''],
    ['غائب', rows.filter((row) => row.status === 'ABSENT').length, 'bad'],
    ['إجازة', rows.filter((row) => row.status === 'LEAVE').length, ''],
    ['استراحة / عطلة', rows.filter((row) => row.status === 'REST' || row.status === 'HOLIDAY').length, ''],
  ];

  const rowHtml = (row: AttendancePrintRow, index: number) => {
    const kind = tone(row.status);
    const day = weekday(row.workDate);
    const checkIn = row.checkInAt ? hospitalClock(row.checkInAt, false, 'mark') : '';
    const checkOut = row.checkOutAt ? hospitalClock(row.checkOutAt, false, 'mark') : '';
    const dutyText = duty(row).replace(/ (ص|م)/g, '\u00a0$1');
    return `<tr class="${index % 2 ? 'alt' : ''} r-${kind}">
      <td class="idx">${index + 1}</td>
      <td class="date"><b dir="ltr">${esc(row.workDate)}</b>${day ? `<small>${day}</small>` : ''}</td>
      <td class="fp">${esc(row.fingerprintId)}</td>
      <td class="name"><div>${esc(row.employeeName)}</div></td>
      <td class="job"><div>${esc(row.jobTitle || '')}</div></td>
      <td class="unit"><div>${esc(row.unitName || row.departmentName || '')}</div></td>
      <td class="duty">${esc(dutyText)}</td>
      <td class="time">${esc(checkIn.replace(' ', '\u00a0'))}</td>
      <td class="time">${esc(checkOut.replace(' ', '\u00a0'))}</td>
      <td>${esc(duration(row.workedMinutes))}</td>
      <td class="strong">${esc(duration(row.lateMinutes))}</td>
      <td class="strong">${esc(duration(row.overtimeMinutes))}</td>
      <td class="st"><span class="pill ${kind}">${esc(row.statusLabel)}</span></td>
    </tr>`;
  };

  const thead = `<thead><tr>
    <th>ت</th><th>التاريخ</th><th>المعرف</th><th>الاسم</th><th>العنوان الوظيفي</th><th>الوحدة</th>
    <th>الدوام</th><th>الحضور</th><th>الانصراف</th><th>الفعلي</th><th>التأخير</th><th>الإضافي</th><th>الحالة</th>
  </tr></thead>`;
  const colgroup = `<colgroup>
    <col style="width:6mm" /><col style="width:17.5mm" /><col style="width:9mm" /><col style="width:32mm" />
    <col style="width:23mm" /><col style="width:15mm" /><col style="width:18mm" /><col style="width:12.5mm" />
    <col style="width:12.5mm" /><col style="width:11.5mm" /><col style="width:9.5mm" /><col style="width:9.5mm" />
    <col style="width:15mm" />
  </colgroup>`;

  const signatures = `<div class="signs">${['منظّم الكشف', 'مسؤول شعبة البصمة', 'مدير القسم']
    .map(
      (label) => `<div class="sign"><div class="sign-h">${label}</div>
        <div class="sign-b"><p><span>الاسم</span><i></i></p><p><span>التوقيع</span><i></i></p><p><span>التاريخ</span><i></i></p></div></div>`,
    )
    .join('')}</div>`;

  const issued = esc(issuedAt());
  const pages = paginate(rows);
  let counter = 0;
  const sheets = pages
    .map((chunk, pageIndex) => {
      const first = pageIndex === 0;
      const last = pageIndex === pages.length - 1;
      const start = counter;
      counter += chunk.length;
      const intro = first
        ? `<div class="head">
            <img src="${origin}/hospital-logo.png" alt="" />
            <div class="identity">
              <div class="state">جمهورية العراق</div>
              <div class="ministry">وزارة الصحة</div>
              <div class="dept">دائرة صحة النجف الأشرف</div>
              <div class="hospital">مستشفى الحكيم العام</div>
            </div>
            <div class="badge"><div class="a">شعبة البصمة</div><div class="c">${issued}</div></div>
          </div>
          <div class="title"><h1>كشف الحضور والانصراف</h1></div>
          <table class="meta"><tr>
            <td><div class="k">الجهاز</div><div class="v">${esc(input.deviceName)}</div></td>
            <td><div class="k">القسم</div><div class="v">${esc(input.departmentName || 'جميع الأقسام')}</div></td>
            <td><div class="k">الفترة</div><div class="v" dir="ltr">${esc(input.fromDate)} → ${esc(input.toDate)}</div></td>
            <td><div class="k">الرقم التسلسلي</div><div class="v" dir="ltr">${esc(input.serial)}</div></td>
          </tr></table>
          <table class="stats"><tr>${stats
            .map(([label, value, kind]) => `<td class="${kind}"><span>${label}</span><b>${value}</b></td>`)
            .join('')}</tr></table>`
        : `<div class="mini"><b>كشف الحضور والانصراف — مستشفى الحكيم العام</b><span dir="ltr">${esc(input.fromDate)} → ${esc(input.toDate)}</span></div>`;
      return `<section class="sheet${last ? ' final' : ''}">
        <div class="frame"></div>
        <div class="content">
          ${intro}
          <table class="data">${colgroup}${thead}<tbody>${chunk.map((row, i) => rowHtml(row, start + i)).join('') || '<tr><td colspan="13" class="empty">لا توجد سجلات ضمن هذه الفترة</td></tr>'}</tbody></table>
          ${last ? signatures : ''}
        </div>
        <div class="foot"><span>مستشفى الحكيم العام — شعبة البصمة</span><span>صفحة ${pageIndex + 1} من ${pages.length}</span><span>${issued}</span></div>
      </section>`;
    })
    .join('');

  const script = options.autoPrint
    ? `<script>
    window.addEventListener('load', async function () {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      window.focus();
      setTimeout(function () { window.print(); }, 250);
    });
  </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>كشف الحضور والانصراف</title>
  <style>
    @font-face { font-family: Amiri; src: url('${origin}/fonts/Amiri-Regular.ttf') format('truetype'); font-weight: 400; }
    @font-face { font-family: Amiri; src: url('${origin}/fonts/Amiri-Bold.ttf') format('truetype'); font-weight: 700; }
    :root { --ink: #14263b; --mute: #5d6977; --line: #cfd5dc; --soft: #f5f7f9; --bad: #9b1c1c; }
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; color: var(--ink); background: #fff; font-family: Amiri, 'Geeza Pro', Tahoma, serif; }

    .sheet { position: relative; width: 210mm; height: 296mm; overflow: hidden; background: #fff; break-after: page; page-break-after: always; }
    .sheet.final { break-after: auto; page-break-after: auto; }
    .frame { position: absolute; inset: 4.5mm; border: 1.6px solid var(--ink); }
    .frame::after { content: ""; position: absolute; inset: 2px; border: 0.6px solid var(--ink); }
    .content { position: absolute; top: 8.5mm; bottom: 15mm; left: 8.5mm; right: 8.5mm; }
    .foot { position: absolute; left: 8.5mm; right: 8.5mm; bottom: 7.5mm; height: 6mm; display: flex; align-items: center; justify-content: space-between; border-top: 0.6px solid var(--ink); font-size: 8.5pt; color: var(--mute); }
    .foot span:nth-child(2) { color: var(--ink); font-weight: 700; }

    table { width: 100%; border-collapse: collapse; }
    .head { display: grid; grid-template-columns: 26mm 1fr 44mm; align-items: center; gap: 4mm; height: 28mm; }
    .head img { width: 24mm; height: 24mm; object-fit: contain; }
    .identity { text-align: center; line-height: 1.35; }
    .identity .state { font-size: 11pt; font-weight: 700; }
    .identity .ministry { font-size: 17pt; font-weight: 700; }
    .identity .dept { font-size: 11pt; color: var(--mute); }
    .identity .hospital { font-size: 13pt; font-weight: 700; }
    .badge { border: 1px solid var(--ink); text-align: center; line-height: 1.4; }
    .badge .a { padding: 2px 4px; font-size: 10.5pt; font-weight: 700; border-bottom: 1px solid var(--ink); }
    .badge .c { padding: 2px 4px 3px; font-size: 9pt; }

    .title { position: relative; margin: 1mm 0 3mm; height: 13mm; padding-top: 2.4mm; text-align: center; border-top: 2.2px solid var(--ink); border-bottom: 0.8px solid var(--ink); }
    .title::before { content: ""; position: absolute; left: 0; right: 0; top: 3px; border-top: 0.8px solid var(--ink); }
    .title h1 { margin: 0; font-size: 19pt; font-weight: 700; line-height: 1.5; }

    .meta td { width: 25%; height: 11mm; padding: 1px 6px; border: 1px solid var(--line); text-align: center; vertical-align: middle; }
    .meta .k { font-size: 8.5pt; color: var(--mute); line-height: 1.2; }
    .meta .v { font-size: 10.5pt; font-weight: 700; line-height: 1.25; }
    .stats { margin: 2mm 0 3mm; table-layout: fixed; }
    .stats td { height: 11mm; border: 1px solid var(--line); background: var(--soft); text-align: center; vertical-align: middle; line-height: 1.2; }
    .stats span { display: block; font-size: 8.5pt; color: var(--mute); }
    .stats b { display: block; font-size: 14pt; }
    .stats td.bad b { color: var(--bad); }

    .mini { display: flex; justify-content: space-between; align-items: center; height: 8mm; padding: 0 2mm; margin-bottom: 0; font-size: 9.5pt; border-bottom: 0.8px solid var(--ink); }
    .mini span { color: var(--mute); }
    .mini + table.data { margin-top: 1mm; }

    table.data { table-layout: fixed; font-size: 8.8pt; }
    table.data th { height: 8mm; background: var(--ink); color: #fff; border: 1px solid var(--ink); border-inline-start-color: #43566b; padding: 0 1px; font-size: 8.8pt; font-weight: 700; text-align: center; line-height: 1.15; }
    table.data td { height: 8mm; padding: 0 2px; border: 0; border-bottom: 1px solid var(--line); text-align: center; vertical-align: middle; line-height: 1.18; overflow: hidden; }
    table.data tr.alt td { background: var(--soft); }
    table.data td.idx { color: var(--mute); font-size: 8pt; }
    table.data td.date b { display: block; font-size: 8.6pt; white-space: nowrap; }
    table.data td.date small { display: block; font-size: 7.5pt; color: var(--mute); }
    table.data td.name { text-align: right; padding-inline: 3px; font-weight: 700; font-size: 9.2pt; }
    table.data td.job, table.data td.unit { text-align: right; padding-inline: 3px; font-size: 8pt; color: var(--mute); }
    table.data td div { max-height: 7.4mm; overflow: hidden; }
    table.data td.duty { font-size: 7.8pt; color: var(--mute); }
    table.data td.fp, table.data td.time, table.data td.strong { font-weight: 700; }
    table.data td.time { white-space: nowrap; }
    table.data tr.r-absent td.name, table.data tr.r-absent td.st { color: var(--bad); }
    table.data tr.r-off td, table.data tr.r-leave td { color: var(--mute); }
    table.data td.empty { height: 20mm; }
    .pill { font-size: 8.8pt; font-weight: 700; }
    .pill.absent { color: var(--bad); }
    .pill.off, .pill.leave, .pill.none { color: var(--mute); font-weight: 400; }

    .signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 5mm; }
    .sign { border: 1px solid var(--ink); }
    .sign-h { text-align: center; padding: 1px; font-size: 10pt; font-weight: 700; border-bottom: 1px solid var(--ink); background: var(--soft); }
    .sign-b { padding: 1mm 3mm 3mm; height: 26mm; }
    .sign-b p { display: flex; align-items: flex-end; gap: 6px; margin: 2.2mm 0 0; font-size: 9pt; }
    .sign-b p i { flex: 1; border-bottom: 1px dotted var(--mute); height: 10px; }

    @media screen {
      body { background: #dfe3e8; padding: 16px 0; }
      .sheet { margin: 0 auto 16px; box-shadow: 0 10px 30px rgba(20, 38, 59, .2); }
    }
  </style>
</head>
<body>
  ${sheets}
  ${script}
</body>
</html>`;
}

export function printAttendanceSheet(input: AttendancePrintInput) {
  const html = buildAttendancePrintHtml(input, window.location.origin, { autoPrint: true });
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
