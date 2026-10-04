import * as XLSX from 'xlsx';
import { clockFrom24, hospitalClock } from '@/lib/hospital-clock';

export type AttendanceExcelRow = {
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
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: string;
  statusLabel: string;
};

function duration(mins: number | null | undefined) {
  if (mins == null || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س ${m} د`;
}

function duty(row: AttendanceExcelRow) {
  if (row.status === 'REST' || row.status === 'LEAVE' || row.status === 'HOLIDAY') return '';
  if (row.scheduledStart && row.scheduledEnd) return `${clockFrom24(row.scheduledStart)} – ${clockFrom24(row.scheduledEnd)}`;
  return '';
}

export function downloadAttendanceExcel(input: {
  deviceName: string;
  fromDate: string;
  toDate: string;
  rows: AttendanceExcelRow[];
}) {
  const sheetRows = input.rows.map((row) => ({
    التاريخ: row.workDate,
    المعرف: row.fingerprintId,
    الاسم: row.employeeName,
    الوظيفة: row.jobTitle,
    القسم: row.departmentName ?? '',
    الوحدة: row.unitName ?? '',
    'الدوام المطلوب': duty(row),
    الحضور: row.checkInAt ? hospitalClock(row.checkInAt) : '',
    الانصراف: row.checkOutAt ? hospitalClock(row.checkOutAt) : '',
    'ساعات الدوام': duration(row.expectedMinutes),
    'العمل الفعلي': duration(row.workedMinutes),
    التأخير: duration(row.lateMinutes),
    'انصراف مبكر': duration(row.earlyLeaveMinutes),
    الإضافي: duration(row.overtimeMinutes),
    الحالة: row.statusLabel,
  }));
  const sheet = XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [{ التاريخ: '' }]);
  sheet['!cols'] = [
    { wch: 14 }, { wch: 10 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
    { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 18 },
  ];
  const book = XLSX.utils.book_new();
  book.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(book, sheet, 'الكشف');
  const safeName = input.deviceName.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'الحضور';
  XLSX.writeFile(book, `كشف-حضور-${safeName}-${input.fromDate}-${input.toDate}.xlsx`);
}
