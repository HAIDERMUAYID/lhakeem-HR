'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, Printer } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/shared/page-skeleton';

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const WORK_TYPE_LABEL: Record<string, string> = {
  MORNING: 'صباحي',
  SHIFTS: 'خفر',
};

const SHIFT_PATTERN_LABEL: Record<string, string> = {
  '1x1': '1×1',
  '1x2': '1×2',
  '1x3': '1×3',
  FIXED: 'ثابت',
};

function formatWorkType(workType: string, shiftPattern: string | null): string {
  const base = WORK_TYPE_LABEL[workType] ?? workType;
  if (workType !== 'SHIFTS' || !shiftPattern) return base;
  const pattern = SHIFT_PATTERN_LABEL[shiftPattern] ?? shiftPattern;
  return `${base} ${pattern}`;
}

/** عرض الوقت: من الساعة X إلى الساعة Y (أرقام إنجليزي) */
function formatTimeRange(start12h: string, end12h: string): string {
  return `من الساعة ${start12h} إلى الساعة ${end12h}`;
}

/** تاريخ ووقت الإصدار بأرقام إنجليزية */
function formatIssueDate(): string {
  const d = new Date();
  const date = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  const h = d.getHours();
  const m = d.getMinutes();
  const hour12 = h % 12 || 12;
  const time = `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
  return `${date}، ${time}`;
}

type ScheduleRow = {
  id: string;
  fullName: string;
  jobTitle: string;
  workType: string;
  shiftPattern: string | null;
  cycleStartDate: string | null;
  startTime: string;
  endTime: string;
  startTime12h: string;
  endTime12h: string;
  workDaysDisplay: string;
  workDaysCount: number;
  totalHoursInMonth: number;
};

type DepartmentBlock = {
  departmentId: string;
  departmentName: string;
  schedules: ScheduleRow[];
  status?: 'APPROVED' | 'PENDING';
};

type ReportData = {
  year: number;
  month: number;
  departmentId: string | null;
  departmentName: string | null;
  departments: DepartmentBlock[];
  schedules: ScheduleRow[];
};

export default function OfficialScheduleReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [departmentId, setDepartmentId] = useState<string>('');

  const { data: scheduleDepts } = useQuery({
    queryKey: ['schedule-departments'],
    queryFn: () =>
      apiGet<{ departmentIds: string[]; departments: { id: string; name: string }[] }>(
        '/api/users/me/schedule-departments'
      ),
  });

  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (departmentId) params.set('departmentId', departmentId);

  const { data, isLoading } = useQuery({
    queryKey: ['schedule-official-report', year, month, departmentId],
    queryFn: () =>
      apiGet<ReportData>(`/api/work-schedules/official-report?${params}`),
  });

  const handlePrint = () => {
    window.print();
  };

  const depts = scheduleDepts?.departments ?? [];
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);
  const hasData = data?.departments?.length && data.departments.some((d) => d.schedules.length > 0);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .print-only { visibility: hidden; position: absolute; left: -9999px; }
        @media print {
          @page { size: A4 portrait; margin: 10mm 2mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          .print-only, .print-only * { visibility: visible !important; }
          .print-only {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            min-height: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #fff !important;
            font-size: 11pt;
          }
          .schedule-dept-page { page-break-after: always; }
          .schedule-dept-page:last-child { page-break-after: auto; }
        }
      `}} />

      <div className="no-print max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link
            href="/dashboard/schedules"
            className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium mb-2"
          >
            <ArrowRight className="h-4 w-4" />
            العودة إلى جداول الدوام
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">تقرير جدول الدوام الرسمي</h1>
          <p className="text-gray-500 mt-1">
            تظهر جميع الجداول (المعتمدة والمعلقة) للطباعة والتوقيع. بعد التوقيع يتم اعتماد جدول القسم من صفحة جداول الدوام.
          </p>
        </div>

        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">السنة</label>
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10))}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 w-28"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">الشهر</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 min-w-[120px]"
                >
                  {MONTHS_AR.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">القسم</label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 min-w-[160px]"
                >
                  <option value="">كل الأقسام (صفحة لكل قسم)</option>
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <Button
                onClick={handlePrint}
                disabled={!hasData}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                طباعة تقرير جدول الدوام
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <TableSkeleton rows={10} />
        ) : data?.departments?.length ? (
          <div className="space-y-8">
            {data.departments.map((block) => (
              <Card key={block.departmentId} className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                    <h2 className="text-lg font-bold text-gray-900">
                      جدول الدوام الشهري – {MONTHS_AR[data.month - 1]} {data.year} – قسم {block.departmentName}
                    </h2>
                    <p className={`text-sm mt-1 ${(block.status ?? 'PENDING') === 'APPROVED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {(block.status ?? 'PENDING') === 'APPROVED' ? 'حالة الجدول: معتمد' : 'حالة الجدول: معلق — للتوقيع والاعتماد'}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 border-collapse">
                      <thead>
                        <tr className="bg-gray-100" style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th className="text-right p-2.5 font-semibold border-l border-gray-200">م</th>
                          <th className="text-right p-3 font-semibold">الاسم الرباعي</th>
                          <th className="text-right p-3 font-semibold">العنوان الوظيفي</th>
                          <th className="text-right p-3 font-semibold">نوع الدوام</th>
                          <th className="text-right p-3 font-semibold">الوقت</th>
                          <th className="text-right p-3 font-semibold">أيام العمل</th>
                          <th className="text-right p-3 font-semibold">إجمالي ساعات الدوام للشهر</th>
                        </tr>
                      </thead>
                      <tbody>
                        {block.schedules.map((row, i) => (
                          <tr key={row.id} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                            <td className="p-2.5 text-center" dir="ltr">{i + 1}</td>
                            <td className="p-2.5">{row.fullName}</td>
                            <td className="p-2.5">{row.jobTitle}</td>
                            <td className="p-2.5">{formatWorkType(row.workType, row.shiftPattern)}</td>
                            <td className="p-2.5 whitespace-nowrap" dir="ltr">{formatTimeRange(row.startTime12h, row.endTime12h)}</td>
                            <td className="p-2.5">{row.workDaysDisplay || '—'}</td>
                            <td className="p-2.5 font-medium" dir="ltr">{row.totalHoursInMonth} ساعة</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : data ? (
          <p className="text-gray-500 text-center py-8">لا توجد جداول للفترة المحددة.</p>
        ) : null}
      </div>

      {data?.departments?.length ? (
        <div className="print-only hidden">
          <OfficialSchedulePrintView data={data} />
        </div>
      ) : null}
    </>
  );
}

function OfficialSchedulePrintView({ data }: { data: ReportData }) {
  const printTime = formatIssueDate();
  const borderColor = '#cbd5e1';

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '11pt' }}>
      {data.departments.map((block) => (
        <div
          key={block.departmentId}
          className="schedule-dept-page"
          style={{
            maxWidth: '210mm',
            margin: '0 auto',
            padding: '12px 6px',
            boxSizing: 'border-box',
          }}
        >
          {/* جدول واحد: الرأس في thead ليتكرر في كل صفحة مطبوعة، والتوقيع مرة واحدة بعد الجدول */}
          <table className="w-full border-collapse" style={{ fontSize: '10pt', border: `1px solid ${borderColor}` }}>
            <thead>
              <tr>
                <td colSpan={7} style={{ border: 'none', padding: 0, verticalAlign: 'top' }}>
                  <div style={{ borderBottom: '2px solid #cbd5e1', paddingBottom: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
                      <img src="/hospital-logo.png" alt="شعار المستشفى" style={{ height: 56, width: 'auto', objectFit: 'contain' }} />
                      <div className="text-center" style={{ color: '#0f172a' }}>
                        <p style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 2 }}>وزارة الصحة</p>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 2 }}>دائرة صحة النجف الأشرف</p>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 0 }}>مستشفى الحكيم العام</p>
                      </div>
                    </div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: 10, marginBottom: 2, textAlign: 'center', color: '#0f172a', borderBottom: '2px solid #334155', paddingBottom: 6 }}>
                      جدول الدوام الشهري – {MONTHS_AR[data.month - 1]} {data.year} – قسم {block.departmentName}
                    </h2>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, textAlign: 'center', marginTop: 4, color: (block.status ?? 'PENDING') === 'APPROVED' ? '#047857' : '#b45309' }}>
                      {(block.status ?? 'PENDING') === 'APPROVED' ? 'حالة الجدول: معتمد' : 'حالة الجدول: معلق — للتوقيع والاعتماد'}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: '#475569', textAlign: 'center', marginTop: 2 }}>تاريخ الإصدار: {printTime}</p>
                  </div>
                </td>
              </tr>
              <tr style={{ backgroundColor: '#334155', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.4)' }}>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>م</th>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>الاسم الرباعي</th>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>العنوان الوظيفي</th>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>نوع الدوام</th>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>الوقت</th>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>أيام العمل</th>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>إجمالي ساعات الدوام للشهر</th>
              </tr>
            </thead>
            <tbody>
              {block.schedules.map((row, i) => (
                <tr key={row.id} style={{ backgroundColor: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
                  <td style={{ borderLeft: `1px solid ${borderColor}`, padding: '4px 5px', textAlign: 'center', direction: 'ltr' }}>{i + 1}</td>
                  <td style={{ borderLeft: `1px solid ${borderColor}`, padding: '4px 5px' }}>{row.fullName}</td>
                  <td style={{ borderLeft: `1px solid ${borderColor}`, padding: '4px 5px' }}>{row.jobTitle}</td>
                  <td style={{ borderLeft: `1px solid ${borderColor}`, padding: '4px 5px' }}>{formatWorkType(row.workType, row.shiftPattern)}</td>
                  <td style={{ borderLeft: `1px solid ${borderColor}`, padding: '4px 5px', whiteSpace: 'nowrap', direction: 'ltr' }}>{formatTimeRange(row.startTime12h, row.endTime12h)}</td>
                  <td style={{ borderLeft: `1px solid ${borderColor}`, padding: '4px 5px' }}>{row.workDaysDisplay || '—'}</td>
                  <td style={{ borderLeft: `1px solid ${borderColor}`, padding: '4px 5px', fontWeight: 600, direction: 'ltr' }}>{row.totalHoursInMonth} ساعة</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* هامش توقيع واحد فقط — بعد نهاية الجدول (حتى لو الجدول عشر صفحات) */}
          <div style={{ marginTop: 32, paddingTop: 10, borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'nowrap' }}>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'center', backgroundColor: '#f8fafc', border: `1px solid ${borderColor}`, borderRadius: 6, padding: '8px 10px' }}>
              <p style={{ fontWeight: 700, color: '#334155', marginBottom: 8, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>مسؤول القسم أو الوحدة</p>
              <p style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 4, whiteSpace: 'nowrap' }}>الاسم: _________________________</p>
              <p style={{ fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>التوقيع: _________________________</p>
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'center', backgroundColor: '#f8fafc', border: `1px solid ${borderColor}`, borderRadius: 6, padding: '8px 10px' }}>
              <p style={{ fontWeight: 700, color: '#334155', marginBottom: 8, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>مدير المستشفى أو الإدارة</p>
              <p style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 4, whiteSpace: 'nowrap' }}>الاسم: _________________________</p>
              <p style={{ fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>التوقيع: _________________________</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
