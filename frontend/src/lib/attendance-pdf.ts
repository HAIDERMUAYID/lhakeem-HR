import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { clockFrom24, hospitalClock } from '@/lib/hospital-clock';

export type AttendanceStatusFilter =
  | 'all'
  | 'present'
  | 'late'
  | 'absent'
  | 'leave'
  | 'rest'
  | 'overtime'
  | 'single';

export type AttendancePdfRow = {
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
  status: 'PRESENT' | 'SINGLE' | 'ABSENT' | 'LEAVE' | 'REST' | 'HOLIDAY';
  statusLabel: string;
};

export const STATUS_FILTER_LABEL: Record<AttendanceStatusFilter, string> = {
  all: 'كل الحالات',
  present: 'الحاضرون',
  late: 'المتأخرون',
  absent: 'الغائبون',
  leave: 'الإجازات',
  rest: 'الاستراحة والعطل',
  overtime: 'العمل الإضافي',
  single: 'بصمة واحدة',
};

export function rosterMatchesStatus(
  row: Pick<AttendancePdfRow, 'status' | 'lateMinutes' | 'overtimeMinutes'>,
  status: AttendanceStatusFilter,
) {
  if (status === 'present') return row.status === 'PRESENT' || row.status === 'SINGLE';
  if (status === 'late') return row.lateMinutes > 0 && (row.status === 'PRESENT' || row.status === 'SINGLE');
  if (status === 'absent') return row.status === 'ABSENT';
  if (status === 'leave') return row.status === 'LEAVE';
  if (status === 'rest') return row.status === 'REST' || row.status === 'HOLIDAY';
  if (status === 'overtime') return row.overtimeMinutes > 0;
  if (status === 'single') return row.status === 'SINGLE';
  return true;
}

export type AttendancePdfLayout = 'detailed' | 'official';

export type AttendancePdfInput = {
  deviceName: string;
  serial: string;
  departmentName: string | null;
  departmentLocked: boolean;
  fromDate: string;
  toDate: string;
  layout?: AttendancePdfLayout;
  filters: {
    name: string;
    department: string;
    unit: string;
    status: AttendanceStatusFilter;
  };
  rows: AttendancePdfRow[];
  onProgress?: (page: number, total: number) => void;
};

const LAYOUTS = {
  detailed: { width: 1123, height: 794, orientation: 'landscape' as const, pdfWidth: 297, pdfHeight: 210, first: 11, next: 18, sign: 4 },
  official: { width: 794, height: 1123, orientation: 'portrait' as const, pdfWidth: 210, pdfHeight: 297, first: 16, next: 26, sign: 6 },
};

const LAYOUT_TITLE: Record<AttendancePdfLayout, string> = {
  detailed: 'الكشف المفصل',
  official: 'الكشف الرسمي',
};

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clock(iso: string | null) {
  return hospitalClock(iso);
}

function duration(mins: number | null | undefined) {
  if (mins == null || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س ${m} د`;
}

function scheduleLabel(row: AttendancePdfRow) {
  if (row.status === 'REST' || row.status === 'LEAVE' || row.status === 'HOLIDAY') return '—';
  if (row.scheduledStart && row.scheduledEnd) return `${clockFrom24(row.scheduledStart)} – ${clockFrom24(row.scheduledEnd)}`;
  return '—';
}

function filterLine(input: AttendancePdfInput) {
  const parts = [
    input.filters.name.trim() ? `الاسم أو المعرف: ${input.filters.name.trim()}` : '',
    input.filters.department ? `القسم: ${input.filters.department}` : '',
    input.filters.unit ? `الوحدة: ${input.filters.unit}` : '',
    input.filters.status !== 'all' ? `الحالة: ${STATUS_FILTER_LABEL[input.filters.status]}` : '',
  ].filter(Boolean);
  return parts.length ? `الفلاتر المطبقة: ${parts.join(' · ')}` : 'الفلاتر: كل صفوف الفترة المحددة';
}

function summarize(rows: AttendancePdfRow[]) {
  return [
    ['الصفوف', rows.length],
    ['حاضر', rows.filter((r) => r.status === 'PRESENT' || r.status === 'SINGLE').length],
    ['متأخر', rows.filter((r) => r.lateMinutes > 0 && (r.status === 'PRESENT' || r.status === 'SINGLE')).length],
    ['بصمة واحدة', rows.filter((r) => r.status === 'SINGLE').length],
    ['غائب', rows.filter((r) => r.status === 'ABSENT').length],
    ['إجازة', rows.filter((r) => r.status === 'LEAVE').length],
    ['استراحة', rows.filter((r) => r.status === 'REST' || r.status === 'HOLIDAY').length],
    ['إضافي', rows.filter((r) => r.overtimeMinutes > 0).length],
  ] as const;
}

function unscheduledCount(rows: AttendancePdfRow[]) {
  return rows.filter(
    (row) =>
      (row.status === 'PRESENT' || row.status === 'SINGLE' || row.status === 'ABSENT') &&
      !row.scheduledStart,
  ).length;
}

type PageSpec = { rows: AttendancePdfRow[]; startIndex: number; summary: boolean; signatures: boolean };

function paginate(rows: AttendancePdfRow[], layout: AttendancePdfLayout): PageSpec[] {
  const spec = LAYOUTS[layout];
  if (!rows.length) return [{ rows: [], startIndex: 0, summary: true, signatures: true }];
  const firstCap = spec.first;
  const nextCap = spec.next;
  const signReserve = spec.sign;
  const pages: PageSpec[] = [];
  let index = 0;
  const push = (count: number, summary: boolean, signatures: boolean) => {
    const slice = rows.slice(index, index + count);
    pages.push({ rows: slice, startIndex: index, summary, signatures });
    index += slice.length;
  };
  if (rows.length <= firstCap - signReserve) {
    push(rows.length, true, true);
    return pages;
  }
  push(Math.min(firstCap, rows.length), true, false);
  while (index < rows.length) {
    const remaining = rows.length - index;
    if (remaining <= nextCap - signReserve) push(remaining, false, true);
    else push(Math.min(nextCap, remaining), false, false);
  }
  const last = pages[pages.length - 1];
  if (!last.signatures) {
    const room = (last.summary ? firstCap : nextCap) - signReserve;
    if (last.rows.length <= room) last.signatures = true;
    else {
      const moved = last.rows.splice(last.rows.length - signReserve);
      pages.push({
        rows: moved,
        startIndex: last.startIndex + last.rows.length,
        summary: false,
        signatures: true,
      });
    }
  }
  return pages;
}

const ink = '#111';
const cellBorder = `1px solid ${ink}`;

function issuedAt() {
  return new Intl.DateTimeFormat('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

function infoCell(label: string, value: string) {
  return `<td style="border:${cellBorder};padding:0;width:25%;vertical-align:top;">
    <div style="background:#111;color:#fff;font-size:10px;font-weight:700;text-align:center;padding:3px 4px;">${label}</div>
    <div style="min-height:28px;padding:5px 6px;text-align:center;font-size:12px;font-weight:700;line-height:1.35;">${value}</div>
  </td>`;
}

function letterhead(input: AttendancePdfInput, layout: AttendancePdfLayout, compact: boolean) {
  const dept = input.departmentName || '—';
  if (compact) {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;background:#111;color:#fff;padding:7px 10px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:700;">مستشفى الحكيم العام — كشف الحضور والانصراف</div>
        <div style="font-size:12px;" dir="ltr">${esc(input.fromDate)} — ${esc(input.toDate)}</div>
      </div>
    `;
  }
  const missing = unscheduledCount(input.rows);
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <img src="/hospital-logo.png" alt="" style="height:78px;width:78px;object-fit:contain;" />
      <div style="flex:1;text-align:center;">
        <div style="font-size:15px;font-weight:700;">جمهورية العراق</div>
        <div style="margin-top:2px;font-size:20px;font-weight:700;">وزارة الصحة</div>
        <div style="margin-top:2px;font-size:15px;font-weight:700;">دائرة صحة النجف الأشرف</div>
        <div style="margin-top:2px;font-size:17px;font-weight:700;">مستشفى الحكيم العام</div>
      </div>
      <div style="width:118px;border:2px solid #111;text-align:center;padding:6px 4px;">
        <div style="font-size:11px;font-weight:700;">شعبة البصمة</div>
        <div style="margin-top:4px;font-size:13px;font-weight:700;">${LAYOUT_TITLE[layout]}</div>
        <div style="margin-top:6px;border-top:1px solid #111;padding-top:4px;font-size:10px;">${esc(issuedAt())}</div>
      </div>
    </div>
    <div style="margin-top:10px;background:#111;color:#fff;text-align:center;font-size:20px;font-weight:700;letter-spacing:0;padding:7px 8px;">
      كشف الحضور والانصراف
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <tr>
        ${infoCell('الجهاز', esc(input.deviceName))}
        ${infoCell('القسم', esc(dept))}
        ${infoCell('الفترة', `<span dir="ltr">${esc(input.fromDate)} — ${esc(input.toDate)}</span>`)}
        ${infoCell('التسلسل', `<span dir="ltr">${esc(input.serial)}</span>`)}
      </tr>
    </table>
    <div style="margin-top:6px;font-size:11px;text-align:center;">${esc(filterLine(input))}${missing ? ` · صفوف بلا جدول: ${missing}` : ''}</div>
  `;
}

function summaryHtml(rows: AttendancePdfRow[]) {
  const cells = summarize(rows)
    .map(
      ([label, value]) =>
        `<td style="border:1px solid #111;padding:0;text-align:center;width:${100 / 8}%;">
          <div style="background:#111;color:#fff;font-size:10px;padding:3px 0;">${label}</div>
          <div style="font-size:16px;font-weight:700;padding:5px 0;line-height:1;">${value}</div>
        </td>`,
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;margin-top:8px;"><tr>${cells}</tr></table>`;
}

function rowCells(row: AttendancePdfRow, index: number, layout: AttendancePdfLayout) {
  const shared = [
    String(index),
    row.workDate,
    row.fingerprintId,
    row.employeeName,
  ];
  if (layout === 'official') {
    return [...shared, row.unitName || '—', clock(row.checkInAt), clock(row.checkOutAt), row.statusLabel];
  }
  return [
    ...shared,
    row.jobTitle || '—',
    row.departmentName || '—',
    row.unitName || '—',
    scheduleLabel(row),
    clock(row.checkInAt),
    clock(row.checkOutAt),
    duration(row.expectedMinutes),
    duration(row.workedMinutes),
    duration(row.lateMinutes),
    duration(row.earlyLeaveMinutes),
    duration(row.overtimeMinutes),
    row.statusLabel,
  ];
}

function tableHtml(rows: AttendancePdfRow[], startIndex: number, layout: AttendancePdfLayout) {
  const head = (layout === 'official'
    ? ['ت', 'التاريخ', 'المعرف', 'الاسم', 'الوحدة', 'حضور', 'انصراف', 'الحالة']
    : ['ت', 'التاريخ', 'المعرف', 'الاسم', 'العنوان', 'القسم', 'الوحدة', 'الدوام', 'حضور', 'انصراف', 'المطلوب', 'الفعلي', 'تأخير', 'مبكر', 'إضافي', 'الحالة']
  )
    .map((h) => `<th style="border:${cellBorder};height:30px;padding:0 4px;font-weight:700;text-align:center;background:#111;color:#fff;white-space:nowrap;">${h}</th>`)
    .join('');
  const rowHeight = layout === 'official' ? 24 : 20;
  const body = rows
    .map((row, i) => {
      const cells = rowCells(row, startIndex + i + 1, layout);
      return `<tr>${cells
        .map((cell, col) => {
          const nameCell = col === 3;
          const shade = row.status === 'ABSENT' ? 'background:#f3f3f3;' : i % 2 === 1 ? 'background:#fafafa;' : '';
          return `<td style="border:${cellBorder};${shade}height:${nameCell ? 'auto' : rowHeight + 'px'};min-height:${rowHeight}px;padding:3px 4px;text-align:${nameCell ? 'right' : 'center'};font-weight:${nameCell || col === cells.length - 1 ? '700' : '400'};white-space:${nameCell ? 'normal' : 'nowrap'};line-height:1.25;vertical-align:middle;">${esc(cell)}</td>`;
        })
        .join('')}</tr>`;
    })
    .join('');
  if (!rows.length) {
    return `<div style="padding:24px 0;text-align:center;font-size:14px;">لا توجد صفوف مطابقة للفلاتر الحالية.</div>`;
  }
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:${layout === 'official' ? 12 : 10}px;table-layout:fixed;">
      <colgroup>
        ${layout === 'official'
          ? '<col style="width:5%"/><col style="width:12%"/><col style="width:7%"/><col style="width:32%"/><col style="width:14%"/><col style="width:8%"/><col style="width:8%"/><col style="width:14%"/>'
          : '<col style="width:4%"/><col style="width:8%"/><col style="width:5%"/><col style="width:14%"/><col style="width:9%"/><col style="width:8%"/><col style="width:7%"/><col style="width:8%"/><col style="width:5%"/><col style="width:5%"/><col style="width:5%"/><col style="width:5%"/><col style="width:5%"/><col style="width:5%"/><col style="width:5%"/><col style="width:7%"/>'}
      </colgroup>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function signaturesHtml() {
  const blocks = ['منظم الكشف', 'مسؤول شعبة البصمة', 'مدير القسم']
    .map(
      (label) => `
      <td style="width:33%;vertical-align:top;padding:0 8px;">
        <div style="border:1.5px solid #111;min-height:108px;padding:8px;text-align:center;">
          <div style="font-weight:700;font-size:13px;">${label}</div>
          <div style="margin-top:18px;text-align:right;font-size:11px;">الاسم: ........................</div>
          <div style="margin-top:14px;text-align:right;font-size:11px;">التوقيع: .....................</div>
          <div style="margin-top:14px;text-align:right;font-size:11px;">التاريخ: .....................</div>
        </div>
      </td>`,
    )
    .join('');
  return `
    <div style="margin-top:auto;padding-top:14px;">
      <table style="width:100%;border-collapse:collapse;"><tr>${blocks}</tr></table>
    </div>
  `;
}

function pageHtml(input: AttendancePdfInput, layout: AttendancePdfLayout, page: PageSpec, pageNo: number, pageCount: number) {
  const spec = LAYOUTS[layout];
  const pad = layout === 'official' ? 28 : 22;
  return `
    <div style="width:${spec.width}px;height:${spec.height}px;padding:${pad}px;box-sizing:border-box;background:#fff;color:#111;display:flex;flex-direction:column;overflow:hidden;font-family:Amiri, 'Geeza Pro', Tahoma, Arial, sans-serif;">
      <div style="flex:1;display:flex;flex-direction:column;border:2px solid #111;padding:12px 12px 8px;min-height:0;">
        ${letterhead(input, layout, !page.summary)}
        ${page.summary ? summaryHtml(input.rows) : ''}
        ${tableHtml(page.rows, page.startIndex, layout)}
        ${page.signatures ? signaturesHtml() : '<div style="flex:1"></div>'}
        <div style="flex-shrink:0;margin-top:${page.signatures ? '8px' : 'auto'};display:flex;justify-content:space-between;align-items:center;border-top:2px solid #111;padding-top:6px;font-size:11px;">
          <span style="font-weight:700;">مستشفى الحكيم العام</span>
          <span style="border:1px solid #111;padding:2px 8px;font-weight:700;">صفحة ${pageNo} من ${pageCount}</span>
        </div>
      </div>
    </div>
  `;
}

function waitForImages(root: ParentNode) {
  const images = [...root.querySelectorAll('img')];
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  );
}

export async function downloadAttendancePdf(input: AttendancePdfInput) {
  const layout = input.layout ?? 'detailed';
  const spec = LAYOUTS[layout];
  const pages = paginate(input.rows, layout);
  const host = document.createElement('div');
  host.setAttribute('dir', 'rtl');
  host.style.position = 'fixed';
  host.style.left = '-12000px';
  host.style.top = '0';
  host.style.zIndex = '-1';
  host.innerHTML = `
    <style>
      @font-face {
        font-family: Amiri;
        src: url('/fonts/Amiri-Regular.ttf') format('truetype');
        font-weight: 400;
      }
      @font-face {
        font-family: Amiri;
        src: url('/fonts/Amiri-Bold.ttf') format('truetype');
        font-weight: 700;
      }
    </style>
  `;
  const sheets = pages.map((page, i) => {
    const el = document.createElement('div');
    el.innerHTML = pageHtml(input, layout, page, i + 1, pages.length);
    host.appendChild(el.firstElementChild as HTMLElement);
    return host.lastElementChild as HTMLElement;
  });
  document.body.appendChild(host);
  try {
    await document.fonts.load('12px Amiri');
    await document.fonts.ready;
    await waitForImages(host);
    const doc = new jsPDF({ orientation: spec.orientation, unit: 'mm', format: 'a4' });
    for (let i = 0; i < sheets.length; i += 1) {
      input.onProgress?.(i + 1, sheets.length);
      const canvas = await toCanvas(sheets[i], {
        pixelRatio: 1.6,
        backgroundColor: '#ffffff',
        width: spec.width,
        height: spec.height,
        skipFonts: true,
      });
      const img = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) doc.addPage();
      doc.addImage(img, 'JPEG', 0, 0, spec.pdfWidth, spec.pdfHeight);
    }
    const safeName = input.deviceName.replace(/[\\/:*?"<>|]/g, '').trim() || 'الحضور';
    doc.save(`كشف-حضور-${LAYOUT_TITLE[layout]}-${safeName}-${input.fromDate}-${input.toDate}.pdf`);
  } finally {
    host.remove();
  }
}
