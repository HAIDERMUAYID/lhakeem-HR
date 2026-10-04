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

export function buildAttendancePrintHtml(
  input: AttendancePrintInput,
  origin: string,
  options: { autoPrint?: boolean } = {},
) {
  const rows = input.rows;
  const counted = (row: AttendancePrintRow) => row.status === 'PRESENT' || row.status === 'SINGLE';
  const present = rows.filter(counted).length;
  const late = rows.filter((row) => counted(row) && row.lateMinutes > 0).length;
  const absent = rows.filter((row) => row.status === 'ABSENT').length;
  const leave = rows.filter((row) => row.status === 'LEAVE').length;
  const rest = rows.filter((row) => row.status === 'REST' || row.status === 'HOLIDAY').length;
  const stats: Array<[string, number, string]> = [
    ['إجمالي السجلات', rows.length, 'total'],
    ['حاضر', present, 'ok'],
    ['متأخر', late, 'late'],
    ['غائب', absent, 'absent'],
    ['إجازة', leave, 'leave'],
    ['استراحة / عطلة', rest, 'off'],
  ];

  const body = rows
    .map((row, index) => {
      const kind = tone(row.status);
      const day = weekday(row.workDate);
      const checkIn = row.checkInAt ? hospitalClock(row.checkInAt, false, 'mark') : '';
      const checkOut = row.checkOutAt ? hospitalClock(row.checkOutAt, false, 'mark') : '';
      return `<tr class="${index % 2 ? 'alt' : ''} r-${kind}">
        <td class="idx">${index + 1}</td>
        <td class="date"><b dir="ltr">${esc(row.workDate)}</b>${day ? `<small>${day}</small>` : ''}</td>
        <td class="fp">${esc(row.fingerprintId)}</td>
        <td class="name">${esc(row.employeeName)}</td>
        <td class="unit">${esc(row.unitName || '')}</td>
        <td class="duty">${esc(duty(row))}</td>
        <td class="time">${esc(checkIn)}</td>
        <td class="time">${esc(checkOut)}</td>
        <td>${esc(duration(row.expectedMinutes))}</td>
        <td>${esc(duration(row.workedMinutes))}</td>
        <td class="${row.lateMinutes > 0 ? 'warn' : ''}">${esc(duration(row.lateMinutes))}</td>
        <td class="${row.overtimeMinutes > 0 ? 'plus' : ''}">${esc(duration(row.overtimeMinutes))}</td>
        <td class="st"><span class="pill ${kind}">${esc(row.statusLabel)}</span></td>
      </tr>`;
    })
    .join('');

  const signatures = ['منظّم الكشف', 'مسؤول شعبة البصمة', 'مدير القسم']
    .map(
      (label) => `<div class="sign">
        <div class="sign-h">${label}</div>
        <div class="sign-b">
          <p><span>الاسم</span><i></i></p>
          <p><span>التوقيع</span><i></i></p>
          <p><span>التاريخ</span><i></i></p>
        </div>
      </div>`,
    )
    .join('');

  const script = options.autoPrint
    ? `<script>
    window.addEventListener('load', async function () {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      window.focus();
      window.print();
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
    :root {
      --ink: #14263b;
      --mute: #5d6977;
      --line: #cfd5dc;
      --soft: #f5f7f9;
      --bad: #9b1c1c;
    }
    @page {
      size: A4 landscape;
      margin: 9mm 10mm 15mm;
      @bottom-center {
        content: "صفحة " counter(page) " من " counter(pages);
        font-family: Amiri, Tahoma, serif;
        font-size: 10pt;
        font-weight: 700;
        color: #14263b;
      }
    }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; color: var(--ink); background: #fff; font-family: Amiri, 'Geeza Pro', Tahoma, serif; }

    /* إطار ثابت في كل صفحة */
    .frame { position: fixed; top: 0; bottom: 0; left: 0; right: 0; border: 1.8px solid var(--ink); pointer-events: none; }
    .frame::after { content: ""; position: absolute; inset: 2.5px; border: 0.6px solid var(--ink); }
    .runfoot { position: fixed; left: 4mm; right: 4mm; bottom: 2mm; height: 6mm; display: flex; align-items: center; justify-content: space-between; border-top: 0.6px solid var(--ink); font-size: 9.5pt; color: var(--mute); }
    .runfoot span:first-child { color: var(--ink); font-weight: 700; }

    .page { padding: 6mm 8mm 11mm; }

    /* ترويسة الصفحة الأولى */
    .head { display: grid; grid-template-columns: 90px 1fr 150px; align-items: center; gap: 12px; padding-bottom: 8px; }
    .head img { width: 80px; height: 80px; object-fit: contain; }
    .identity { text-align: center; line-height: 1.4; }
    .identity .state { font-size: 12.5pt; font-weight: 700; }
    .identity .ministry { font-size: 20pt; font-weight: 700; }
    .identity .dept { font-size: 12.5pt; color: var(--mute); }
    .identity .hospital { font-size: 15pt; font-weight: 700; }
    .badge { border: 1px solid var(--ink); text-align: center; line-height: 1.4; }
    .badge .a { padding: 3px 4px; font-size: 11.5pt; font-weight: 700; border-bottom: 1px solid var(--ink); }
    .badge .b { padding: 3px 4px 0; font-size: 10pt; color: var(--mute); }
    .badge .c { padding: 0 4px 4px; font-size: 10pt; font-weight: 700; }

    .title { position: relative; margin: 0 0 9px; padding: 5px 0 4px; text-align: center; border-top: 2.4px solid var(--ink); border-bottom: 0.8px solid var(--ink); }
    .title::before { content: ""; position: absolute; left: 0; right: 0; top: 3px; border-top: 0.8px solid var(--ink); }
    .title h1 { margin: 5px 0 0; font-size: 22pt; font-weight: 700; letter-spacing: .5px; line-height: 1.3; }

    table { width: 100%; border-collapse: collapse; }
    .meta td { width: 25%; padding: 3px 8px 4px; border: 1px solid var(--line); text-align: center; vertical-align: top; }
    .meta .k { font-size: 9.5pt; color: var(--mute); }
    .meta .v { font-size: 12pt; font-weight: 700; }

    .stats { margin: 6px 0 0; table-layout: fixed; }
    .stats td { padding: 3px 4px 4px; border: 1px solid var(--line); text-align: center; background: var(--soft); }
    .stats .k { font-size: 9.5pt; color: var(--mute); }
    .stats .v { font-size: 16pt; font-weight: 700; line-height: 1.2; }
    .stats .absent .v { color: var(--bad); }

    /* الجدول */
    table.data { table-layout: fixed; font-size: 10.5pt; }
    table.data thead { display: table-header-group; }
    table.data tfoot { display: table-footer-group; }
    table.data th { background: var(--ink); color: #fff; border: 1px solid var(--ink); border-inline-start-color: #43566b; padding: 5px 2px 6px; font-size: 10pt; font-weight: 700; text-align: center; }
    table.data td { border: 0; border-bottom: 1px solid var(--line); padding: 2px 3px; text-align: center; vertical-align: middle; line-height: 1.25; height: 7.4mm; }
    table.data tr.sp th, table.data tr.sp td { border: 0; background: transparent; padding: 0; height: 0; }
    table.data tr { break-inside: avoid; page-break-inside: avoid; }
    table.data tr.alt td { background: var(--soft); }
    table.data td.idx { color: var(--mute); font-size: 9.5pt; }
    table.data td.name { text-align: right; padding-inline: 5px; font-weight: 700; font-size: 11pt; }
    table.data td.date b { display: block; font-size: 10pt; }
    table.data td.date small { display: block; font-size: 8.5pt; color: var(--mute); }
    table.data td.fp, table.data td.time { font-weight: 700; }
    table.data td.duty, table.data td.unit { font-size: 9.5pt; color: var(--mute); }
    table.data td.warn, table.data td.plus { font-weight: 700; }
    table.data tr.r-absent td.name, table.data tr.r-absent td.st { color: var(--bad); }
    table.data tr.r-off td, table.data tr.r-leave td { color: var(--mute); }
    .pill { font-size: 10pt; font-weight: 700; }
    .pill.absent { color: var(--bad); }
    .pill.off, .pill.leave, .pill.none { color: var(--mute); font-weight: 400; }
    .pill.single::before { content: "◐ "; }
    .pill.ok::before { content: "● "; font-size: 7pt; vertical-align: 1px; }

    /* التواقيع */
    .signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 14px; break-inside: avoid; page-break-inside: avoid; }
    .sign { border: 1px solid var(--ink); break-inside: avoid; }
    .sign-h { text-align: center; padding: 3px; font-size: 12pt; font-weight: 700; border-bottom: 1px solid var(--ink); background: var(--soft); }
    .sign-b { padding: 4px 10px 8px; min-height: 25mm; }
    .sign-b p { display: flex; align-items: flex-end; gap: 6px; margin: 8px 0 0; font-size: 10.5pt; }
    .sign-b p i { flex: 1; border-bottom: 1px dotted var(--mute); height: 12px; }
    .note { margin-top: 8px; text-align: center; font-size: 9.5pt; color: var(--mute); }

    @media screen {
      body { background: #dfe3e8; padding: 20px; }
      .page { max-width: 1120px; margin: 0 auto; background: #fff; padding: 18px 22px; border: 1.8px solid var(--ink); box-shadow: 0 14px 36px rgba(20, 38, 59, .18); }
      .frame, .runfoot { display: none; }
    }
  </style>
</head>
<body>
  <div class="frame"></div>
  <div class="runfoot">
    <span>مستشفى الحكيم العام — شعبة البصمة</span>
    <span>${esc(input.deviceName)} · ${esc(input.fromDate)} — ${esc(input.toDate)}</span>
    <span>صدر بتاريخ ${esc(issuedAt())}</span>
  </div>
  <div class="page">
    <div class="head">
      <img src="${origin}/hospital-logo.png" alt="" />
      <div class="identity">
        <div class="state">جمهورية العراق</div>
        <div class="ministry">وزارة الصحة</div>
        <div class="dept">دائرة صحة النجف الأشرف</div>
        <div class="hospital">مستشفى الحكيم العام</div>
      </div>
      <div class="badge">
        <div class="a">شعبة البصمة</div>
        <div class="b">كشف الحضور والانصراف</div>
        <div class="c">${esc(issuedAt())}</div>
      </div>
    </div>
    <div class="rule"></div>
    <div class="title"><h1>كشف الحضور والانصراف</h1></div>
    <table class="meta">
      <tr>
        <td><div class="k">الجهاز</div><div class="v">${esc(input.deviceName)}</div></td>
        <td><div class="k">القسم</div><div class="v">${esc(input.departmentName || 'جميع الأقسام')}</div></td>
        <td><div class="k">الفترة</div><div class="v" dir="ltr">${esc(input.fromDate)} → ${esc(input.toDate)}</div></td>
        <td><div class="k">رقم الجهاز التسلسلي</div><div class="v" dir="ltr">${esc(input.serial)}</div></td>
      </tr>
    </table>
    <table class="stats">
      <tr>
        ${stats.map(([label, value, kind]) => `<td class="${kind}"><div class="k">${label}</div><div class="v">${value}</div></td>`).join('')}
      </tr>
    </table>
    <table class="data">
      <colgroup>
        <col style="width:3%" /><col style="width:9%" /><col style="width:5.5%" /><col style="width:20%" />
        <col style="width:8%" /><col style="width:12%" /><col style="width:7.5%" /><col style="width:7.5%" />
        <col style="width:5.5%" /><col style="width:5.5%" /><col style="width:4.5%" /><col style="width:4.5%" />
        <col style="width:7%" />
      </colgroup>
      <thead>
        <tr class="sp"><th colspan="13" style="height:5mm"></th></tr>
        <tr>
          <th>ت</th><th>التاريخ</th><th>المعرف</th><th>الاسم</th><th>الوحدة</th><th>الدوام</th>
          <th>الحضور</th><th>الانصراف</th><th>المطلوب</th><th>الفعلي</th><th>التأخير</th><th>الإضافي</th><th>الحالة</th>
        </tr>
      </thead>
      <tfoot><tr class="sp"><td colspan="13" style="height:11mm"></td></tr></tfoot>
      <tbody>${body || '<tr><td colspan="13" style="padding:18px">لا توجد سجلات ضمن هذه الفترة</td></tr>'}</tbody>
    </table>
    <div class="signs">${signatures}</div>
    <div class="note">هذا الكشف مستخرج من نظام الحضور والانصراف الإلكتروني لمستشفى الحكيم العام ولا يُعتدّ به دون التواقيع الرسمية.</div>
  </div>
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
