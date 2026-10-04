import * as XLSX from 'xlsx';
import { clockFrom24, hospitalClock } from '@/lib/hospital-clock';
import { summarizeByEmployee, summarizeRows, weekdayName, type RosterRow } from '@/lib/attendance-stats';

export type AttendanceExcelRow = {
  employeeId: string;
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
    اليوم: weekdayName(row.workDate),
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
    { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
    { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 18 },
  ];
  const book = XLSX.utils.book_new();
  book.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(book, sheet, 'الكشف');

  if (input.rows.length) {
    const minutes = (value: number) => Math.round(value);
    const perEmployee = summarizeByEmployee(input.rows as RosterRow[]).map((item) => ({
      الموظف: item.employeeName,
      الوظيفة: item.jobTitle,
      المعرف: item.fingerprintId,
      الوحدة: item.unitName ?? '',
      'أيام الحضور': item.present,
      'مرات التأخير': item.late,
      'أيام الغياب': item.absent,
      الإجازات: item.leave,
      'بصمة واحدة': item.single,
      'مجموع التأخير (دقيقة)': minutes(item.lateMinutes),
      'الإضافي (دقيقة)': minutes(item.overtimeMinutes),
      'ساعات العمل الفعلي': Math.round((item.workedMinutes / 60) * 100) / 100,
      'نسبة الحضور %': item.attendanceRate ?? '',
    }));
    const summarySheet = XLSX.utils.json_to_sheet(perEmployee);
    summarySheet['!cols'] = [
      { wch: 30 }, { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(book, summarySheet, 'ملخص الموظفين');

    const total = summarizeRows(input.rows as RosterRow[]);
    const overview = XLSX.utils.aoa_to_sheet([
      ['الجهاز', input.deviceName],
      ['الفترة', `${input.fromDate} → ${input.toDate}`],
      ['عدد السجلات', total.total],
      ['حاضر', total.present],
      ['متأخر', total.late],
      ['بصمة واحدة', total.single],
      ['غائب', total.absent],
      ['إجازة', total.leave],
      ['استراحة / عطلة', total.rest],
      ['نسبة الحضور %', total.attendanceRate ?? ''],
      ['الالتزام بالوقت %', total.punctualityRate ?? ''],
      ['مجموع التأخير (دقيقة)', minutes(total.lateMinutes)],
      ['مجموع الإضافي (دقيقة)', minutes(total.overtimeMinutes)],
      ['ساعات العمل الفعلي', Math.round((total.workedMinutes / 60) * 100) / 100],
    ]);
    overview['!cols'] = [{ wch: 26 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(book, overview, 'نظرة عامة');
  }
  const safeName = input.deviceName.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'الحضور';
  XLSX.writeFile(book, `كشف-حضور-${safeName}-${input.fromDate}-${input.toDate}.xlsx`);
}
