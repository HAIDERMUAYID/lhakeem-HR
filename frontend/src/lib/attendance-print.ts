import { clockFrom24, hospitalClock } from '@/lib/hospital-clock';

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

function issuedAt() {
  return new Intl.DateTimeFormat('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

export function printAttendanceSheet(input: {
  deviceName: string;
  serial: string;
  departmentName: string | null;
  fromDate: string;
  toDate: string;
  rows: AttendancePrintRow[];
}) {
  const origin = window.location.origin;
  const present = input.rows.filter((row) => row.status === 'PRESENT' || row.status === 'SINGLE').length;
  const late = input.rows.filter((row) => row.lateMinutes > 0 && (row.status === 'PRESENT' || row.status === 'SINGLE')).length;
  const absent = input.rows.filter((row) => row.status === 'ABSENT').length;
  const leave = input.rows.filter((row) => row.status === 'LEAVE').length;
  const rest = input.rows.filter((row) => row.status === 'REST' || row.status === 'HOLIDAY').length;
  const stats = [
    ['الصفوف', input.rows.length],
    ['حاضر', present],
    ['متأخر', late],
    ['غائب', absent],
    ['إجازة', leave],
    ['استراحة', rest],
  ];
  const body = input.rows
    .map((row, index) => {
      const tone = ` class="${row.status.toLowerCase()}${row.lateMinutes > 0 ? ' late' : ''}"`;
      const cells = [
        String(index + 1),
        row.workDate,
        row.fingerprintId,
        row.employeeName,
        row.unitName || '',
        duty(row),
        row.checkInAt ? hospitalClock(row.checkInAt, false, 'mark') : '',
        row.checkOutAt ? hospitalClock(row.checkOutAt, false, 'mark') : '',
        duration(row.expectedMinutes),
        duration(row.workedMinutes),
        duration(row.lateMinutes),
        duration(row.overtimeMinutes),
        row.statusLabel,
      ];
      return `<tr${tone}>${cells
        .map((cell, col) => `<td${col === 3 ? ' class="name"' : ''}>${esc(cell)}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>كشف الحضور والانصراف</title>
  <style>
    @font-face { font-family: Amiri; src: url('${origin}/fonts/Amiri-Regular.ttf') format('truetype'); font-weight: 400; }
    @font-face { font-family: Amiri; src: url('${origin}/fonts/Amiri-Bold.ttf') format('truetype'); font-weight: 700; }
    @page {
      size: A4 landscape;
      margin: 8mm 8mm 12mm;
      @bottom-center {
        content: "صفحة " counter(page) " من " counter(pages);
        font-family: Amiri, Tahoma, serif;
        font-size: 10pt;
        color: #12324f;
      }
    }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; color: #12324f; background: #fff; font-family: Amiri, 'Geeza Pro', Tahoma, serif; }
    .letter { display: flex; align-items: center; gap: 10px; border-bottom: 3px solid #12324f; padding-bottom: 6px; }
    .letter img { width: 58px; height: 58px; object-fit: contain; }
    .letter .mid { flex: 1; text-align: center; }
    .letter .mid .l1 { font-size: 12px; color: #8a6a22; font-weight: 700; }
    .letter .mid .l2 { font-size: 20px; font-weight: 700; color: #12324f; }
    .letter .mid .l3 { font-size: 13px; font-weight: 700; }
    .letter .side { width: 150px; background: #12324f; color: #fff; text-align: center; padding: 6px 4px; }
    .letter .side b { display: block; font-size: 13px; }
    .letter .side span { display: block; margin-top: 4px; color: #f3e2b3; font-size: 11px; }
    .rule { height: 3px; margin-top: 2px; background: linear-gradient(90deg, #12324f, #c6a15b, #12324f); }
    .stats { width: 100%; border-collapse: collapse; margin-top: 6px; }
    .stats td { width: 16.66%; border: 1px solid #d5deea; text-align: center; background: #f7fafc; }
    .stats .k { color: #5c6b7a; font-size: 10px; padding-top: 3px; }
    .stats .v { color: #12324f; font-size: 16px; font-weight: 700; padding-bottom: 3px; }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 6px; font-size: 10.5px; }
    table.data thead { display: table-header-group; }
    table.data tfoot { display: table-footer-group; }
    table.data tbody tr, table.data tbody td { break-inside: avoid; page-break-inside: avoid; }
    thead { display: table-header-group; }
    table.data th { background: #12324f; color: #fff; border: 1px solid #0d2438; padding: 5px 3px; font-weight: 700; text-align: center; }
    table.data td { border: 1px solid #d5deea; padding: 4px 3px; text-align: center; vertical-align: middle; background: #fff; }
    table.data td.name { text-align: right; font-weight: 700; color: #12324f; white-space: normal; line-height: 1.25; }
    table.data tr.present td { background: #eef8f2; }
    table.data tr.single td { background: #eef6fb; }
    table.data tr.absent td { background: #fdf0f0; }
    table.data tr.leave td { background: #f6f0fb; }
    table.data tr.rest td, table.data tr.holiday td { background: #f4f6f8; }
    table.data tr.late td { background: #fff6ea; }
    tbody tr, tbody td, .signs, .signs td { break-inside: avoid; page-break-inside: avoid; }
    .signs { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .signs td { width: 33.33%; padding: 0 6px; vertical-align: top; }
    .sign { border: 1px solid #12324f; border-top: 4px solid #c6a15b; min-height: 78px; padding: 7px 8px; background: #fbfcfe; }
    .sign b { display: block; text-align: center; color: #12324f; font-size: 13px; }
    .sign p { margin: 9px 0 0; font-size: 12px; color: #334155; }
    @media screen { body { background: #e7eef5; } .sheet { width: 297mm; margin: 12px auto; background: #fff; padding: 8mm; box-shadow: 0 12px 36px rgba(18,50,79,.16); } }
    @media print { .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="letter">
      <img src="${origin}/hospital-logo.png" alt="" />
      <div class="mid">
        <div class="l1">جمهورية العراق · وزارة الصحة</div>
        <div class="l2">دائرة صحة النجف الأشرف</div>
        <div class="l3">مستشفى الحكيم العام — كشف الحضور والانصراف</div>
      </div>
      <div class="side"><b>شعبة البصمة</b><span>${esc(issuedAt())}</span></div>
    </div>
    <div class="rule"></div>
    <table class="stats">
      <tr>${stats.map(([label, value]) => `<td><div class="k">${label}</div><div class="v">${value}</div></td>`).join('')}</tr>
    </table>
    <p style="margin:6px 0 0;font-size:12px;font-weight:700;color:#12324f;">${esc(input.deviceName)} · ${esc(input.departmentName || '—')} · <span dir="ltr">${esc(input.fromDate)} — ${esc(input.toDate)}</span></p>
    <table class="data">
      <colgroup>
        <col style="width:4%"/><col style="width:9%"/><col style="width:6%"/><col style="width:16%"/>
        <col style="width:9%"/><col style="width:12%"/><col style="width:8%"/><col style="width:8%"/>
        <col style="width:5%"/><col style="width:5%"/><col style="width:5%"/><col style="width:5%"/><col style="width:8%"/>
      </colgroup>
      <thead>
        <tr>
          <th>ت</th><th>التاريخ</th><th>المعرف</th><th>الاسم</th><th>الوحدة</th><th>الدوام</th>
          <th>حضور</th><th>انصراف</th><th>المطلوب</th><th>الفعلي</th><th>تأخير</th><th>إضافي</th><th>الحالة</th>
        </tr>
      </thead>
      <tbody>${body || '<tr><td colspan="13">لا توجد صفوف للطباعة</td></tr>'}</tbody>
    </table>
    <table class="signs">
      <tr>
        ${['منظم الكشف', 'مسؤول شعبة البصمة', 'مدير القسم']
          .map(
            (label) => `<td><div class="sign"><b>${label}</b><p>الاسم: ........................</p><p>التوقيع: .....................</p><p>التاريخ: .....................</p></div></td>`,
          )
          .join('')}
      </tr>
    </table>
    <div class="foot"><span>مستشفى الحكيم العام</span><span>وثيقة حضور وانصراف</span></div>
  </div>
  <script>
    window.addEventListener('load', async function () {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      window.focus();
      window.print();
    });
  </script>
</body>
</html>`;
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
