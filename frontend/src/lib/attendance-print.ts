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
  return `${clockFrom24(row.scheduledStart)} – ${clockFrom24(row.scheduledEnd)}`;
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
        row.checkInAt ? hospitalClock(row.checkInAt) : '',
        row.checkOutAt ? hospitalClock(row.checkOutAt) : '',
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
    @page { size: A4 landscape; margin: 8mm 10mm 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: #fff; font-family: Amiri, 'Geeza Pro', Tahoma, serif; }
    .frame { border: 2.5px solid #111; padding: 10px 12px 8px; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .head img { width: 72px; height: 72px; object-fit: contain; }
    .identity { flex: 1; text-align: center; }
    .identity .state { font-size: 13px; font-weight: 700; }
    .identity .ministry { margin-top: 2px; font-size: 22px; font-weight: 700; }
    .identity .dept { margin-top: 1px; font-size: 14px; font-weight: 700; }
    .identity .hospital { margin-top: 1px; font-size: 16px; font-weight: 700; }
    .badge { width: 128px; border: 2px solid #111; text-align: center; padding: 6px 4px; }
    .badge b { display: block; font-size: 13px; }
    .badge span { display: block; margin-top: 6px; border-top: 1px solid #111; padding-top: 4px; font-size: 11px; }
    .title { margin-top: 8px; background: #111; color: #fff; text-align: center; font-size: 20px; font-weight: 700; padding: 6px 8px; }
    .meta, .stats, table { width: 100%; border-collapse: collapse; }
    .meta { margin-top: 8px; }
    .meta td { border: 1px solid #111; width: 25%; padding: 0; vertical-align: top; }
    .meta .k { background: #111; color: #fff; text-align: center; font-size: 11px; font-weight: 700; padding: 3px; }
    .meta .v { min-height: 26px; text-align: center; font-size: 13px; font-weight: 700; padding: 5px 4px; }
    .stats { margin-top: 8px; }
    .stats td { border: 1px solid #111; text-align: center; width: 16.66%; padding: 0; }
    .stats .k { background: #111; color: #fff; font-size: 11px; padding: 3px; }
    .stats .v { font-size: 18px; font-weight: 700; padding: 4px 0 5px; }
    table.data { margin-top: 8px; font-size: 11px; }
    table.data th { background: #111; color: #fff; border: 1px solid #111; padding: 5px 3px; font-weight: 700; }
    table.data td { border: 1px solid #111; padding: 4px 3px; text-align: center; vertical-align: middle; }
    table.data td.name { text-align: right; font-weight: 700; }
    table.data tr.alt td { background: #f7f7f7; }
    table.data tr.absent td { background: #ececec; }
    thead { display: table-header-group; }
    tr, .signs td { break-inside: avoid; page-break-inside: avoid; }
    .signs { width: 100%; border-collapse: collapse; margin-top: 14px; }
    .signs td { width: 33.33%; padding: 0 6px; vertical-align: top; }
    .sign { border: 1.5px solid #111; min-height: 92px; padding: 8px; text-align: center; }
    .sign b { font-size: 13px; }
    .sign p { margin: 12px 0 0; text-align: right; font-size: 12px; }
    .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; border-top: 2px solid #111; padding-top: 5px; font-size: 11px; font-weight: 700; }
    @media screen {
      body { background: #d9d3c7; padding: 18px; }
      .frame { max-width: 1120px; margin: 0 auto; background: #fff; box-shadow: 0 16px 40px rgba(0,0,0,.18); }
    }
  </style>
</head>
<body>
  <div class="frame">
    <div class="head">
      <img src="${origin}/hospital-logo.png" alt="" />
      <div class="identity">
        <div class="state">جمهورية العراق</div>
        <div class="ministry">وزارة الصحة</div>
        <div class="dept">دائرة صحة النجف الأشرف</div>
        <div class="hospital">مستشفى الحكيم العام</div>
      </div>
      <div class="badge">
        <b>شعبة البصمة</b>
        <b>كشف الحضور</b>
        <span>${esc(issuedAt())}</span>
      </div>
    </div>
    <div class="title">كشف الحضور والانصراف</div>
    <table class="meta">
      <tr>
        <td><div class="k">الجهاز</div><div class="v">${esc(input.deviceName)}</div></td>
        <td><div class="k">القسم</div><div class="v">${esc(input.departmentName || '—')}</div></td>
        <td><div class="k">الفترة</div><div class="v" dir="ltr">${esc(input.fromDate)} — ${esc(input.toDate)}</div></td>
        <td><div class="k">التسلسل</div><div class="v" dir="ltr">${esc(input.serial)}</div></td>
      </tr>
    </table>
    <table class="stats">
      <tr>
        ${stats.map(([label, value]) => `<td><div class="k">${label}</div><div class="v">${value}</div></td>`).join('')}
      </tr>
    </table>
    <table class="data">
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
