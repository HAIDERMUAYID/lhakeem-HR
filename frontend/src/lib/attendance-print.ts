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
      const tone = row.status === 'ABSENT' ? ' class="absent"' : index % 2 ? ' class="alt"' : '';
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
    @page { size: A4 landscape; margin: 7mm 7mm 11mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; color: #111; background: #fff; font-family: Amiri, 'Geeza Pro', Tahoma, serif; }
    table { width: 100%; border-collapse: collapse; }
    .banner { display: flex; align-items: center; gap: 8px; }
    .banner img { width: 34px; height: 34px; object-fit: contain; }
    .banner .txt { flex: 1; text-align: right; line-height: 1.25; }
    .banner b { font-size: 13px; }
    .banner span { display: block; font-size: 11px; }
    .stats td { border: 1px solid #111; text-align: center; padding: 0; }
    .stats .k { background: #111; color: #fff; font-size: 10px; padding: 2px 0; }
    .stats .v { font-size: 14px; font-weight: 700; padding: 3px 0 4px; }
    table.data { table-layout: fixed; margin-top: 6px; font-size: 10.5px; }
    table.data th, table.data td { border: 1px solid #111; padding: 3px 3px; text-align: center; vertical-align: middle; white-space: nowrap; overflow: hidden; }
    table.data th { background: #111; color: #fff; font-weight: 700; font-size: 11px; }
    table.data td.name { text-align: right; font-weight: 700; white-space: normal; line-height: 1.2; }
    table.data tr.alt td { background: #f6f6f6; }
    table.data tr.absent td { background: #ececec; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr, .signs td { break-inside: avoid; page-break-inside: avoid; }
    .mast th { background: #fff; color: #111; border: none; padding: 0 0 6px; text-align: right; }
    .signs { margin-top: 10px; }
    .signs td { width: 33.33%; padding: 0 5px; vertical-align: top; }
    .sign { border: 1.5px solid #111; height: 78px; padding: 6px 8px; }
    .sign b { display: block; text-align: center; font-size: 12px; }
    .sign p { margin: 8px 0 0; font-size: 11px; }
    .foot { margin-top: 6px; border-top: 2px solid #111; padding-top: 4px; display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; }
    @media screen {
      body { background: #e6e1d6; }
      .sheet { width: 297mm; min-height: 210mm; margin: 10px auto; background: #fff; padding: 7mm; }
    }
    @media print {
      .sheet { width: 100%; margin: 0; padding: 0; min-height: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <table class="stats">
      <tr>${stats.map(([label, value]) => `<td><div class="k">${label}</div><div class="v">${value}</div></td>`).join('')}</tr>
    </table>
    <table class="data">
      <colgroup>
        <col style="width:4%"/><col style="width:9%"/><col style="width:6%"/><col style="width:16%"/>
        <col style="width:9%"/><col style="width:12%"/><col style="width:8%"/><col style="width:8%"/>
        <col style="width:5%"/><col style="width:5%"/><col style="width:5%"/><col style="width:5%"/><col style="width:8%"/>
      </colgroup>
      <thead>
        <tr class="mast">
          <th colspan="13">
            <div class="banner">
              <img src="${origin}/hospital-logo.png" alt="" />
              <div class="txt">
                <b>وزارة الصحة — دائرة صحة النجف الأشرف — مستشفى الحكيم العام</b>
                <span>كشف الحضور والانصراف · ${esc(input.deviceName)} · ${esc(input.departmentName || '—')} · <span dir="ltr">${esc(input.fromDate)} — ${esc(input.toDate)}</span> · ${esc(issuedAt())}</span>
              </div>
            </div>
          </th>
        </tr>
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
