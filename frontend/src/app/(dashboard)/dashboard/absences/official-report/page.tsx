'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowRight,
  Printer,
  Users,
  Sun,
  Moon,
  Building2,
  TrendingUp,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/shared/page-skeleton';

type AbsenceRow = {
  id: string;
  fullName: string;
  jobTitle: string;
  departmentName: string;
  workType: string;
  date: string;
  reason: string | null;
};

type ReportData = {
  fromDate: string;
  toDate: string;
  absences: AbsenceRow[];
  kpis: {
    total: number;
    morning: number;
    shifts: number;
    departmentsCount: number;
    topDepartment: string;
    topDepartmentCount: number;
  };
};

const WORK_TYPE_LABEL: Record<string, string> = {
  MORNING: 'صباحي',
  SHIFTS: 'خفر',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default function OfficialAbsenceReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [canAccess, setCanAccess] = useState(false);

  useEffect(() => {
    try {
      const u = localStorage.getItem('user');
      const p = JSON.parse(u || '{}')?.permissions ?? [];
      setCanAccess(
        p.includes('ADMIN') ||
          p.includes('FINGERPRINT_OFFICER') ||
          p.includes('FINGERPRINT_MANAGER'),
      );
    } catch {
      setCanAccess(false);
    }
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['absence-official-report', fromDate, toDate],
    queryFn: () =>
      apiGet<ReportData>(
        `/api/absence-reports/official-report?from=${fromDate}&to=${toDate}`,
      ),
    enabled: canAccess && !!fromDate && !!toDate,
  });

  const handlePrint = () => {
    window.print();
  };

  if (!canAccess) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-gray-600">غير مصرح لك بعرض كشف الغيابات الرسمي.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard/absences">العودة إلى الغيابات</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 14mm; }
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
        }
      `}} />

      <div className="no-print max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link
            href="/dashboard/absences"
            className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium mb-2"
          >
            <ArrowRight className="h-4 w-4" />
            العودة إلى الغيابات
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">كشف الغيابات الرسمي</h1>
          <p className="text-gray-500 mt-1">عرض وطباعة كشف الغيابات للفترة المحددة</p>
        </div>

        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">من تاريخ</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">إلى تاريخ</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button
                onClick={handlePrint}
                disabled={!data?.absences?.length}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                طباعة كشف الغيابات الرسمي
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <TableSkeleton rows={10} />
        ) : data ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="border-0 shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-8 w-8 text-primary-600" />
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{data.kpis.total}</p>
                      <p className="text-xs text-gray-500">إجمالي الغائبين</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Sun className="h-8 w-8 text-amber-600" />
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{data.kpis.morning}</p>
                      <p className="text-xs text-gray-500">صباحي</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Moon className="h-8 w-8 text-violet-600" />
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{data.kpis.shifts}</p>
                      <p className="text-xs text-gray-500">خفر</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-8 w-8 text-slate-600" />
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{data.kpis.departmentsCount}</p>
                      <p className="text-xs text-gray-500">أقسام</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow sm:col-span-2">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-8 w-8 text-emerald-600" />
                    <div>
                      <p className="text-lg font-bold text-gray-900">{data.kpis.topDepartment}</p>
                      <p className="text-xs text-gray-500">أكثر قسم غياباً ({data.kpis.topDepartmentCount})</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-md overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-right p-3 font-semibold text-gray-700">الاسم الرباعي</th>
                        <th className="text-right p-3 font-semibold text-gray-700">العنوان الوظيفي</th>
                        <th className="text-right p-3 font-semibold text-gray-700">القسم</th>
                        <th className="text-right p-3 font-semibold text-gray-700">نوع الدوام</th>
                        <th className="text-right p-3 font-semibold text-gray-700">تاريخ الغياب</th>
                        <th className="text-right p-3 font-semibold text-gray-700">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.absences.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center text-gray-500 p-8">
                            لا توجد غيابات في الفترة المحددة
                          </td>
                        </tr>
                      ) : (
                        data.absences.map((row) => (
                          <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                            <td className="p-3 font-medium">{row.fullName}</td>
                            <td className="p-3">{row.jobTitle}</td>
                            <td className="p-3">{row.departmentName}</td>
                            <td className="p-3">{WORK_TYPE_LABEL[row.workType] ?? row.workType}</td>
                            <td className="p-3">{formatDate(row.date)}</td>
                            <td className="p-3 text-gray-500">{row.reason ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* Print-only official layout - hidden on screen, shown when printing */}
      <div className="print-only" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0, width: '210mm' }}>
        <OfficialReportPrintView data={data} fromDate={fromDate} toDate={toDate} />
      </div>
    </>
  );
}

/**
 * كشف الغيابات الرسمي — نسخة الطباعة
 * - الرأس: لون أزرق مؤسسي (بدون أخضر)، شعار المستشفى، عنوان التقرير بارز بحد سفلي
 * - KPIs: بطاقات (أزرق، كهرماني، بنفسجي، رمادي)
 * - التذييل: يمين = مسؤول وحدة البصمة، يسار = مدير المستشفى / المسؤول الإداري
 */
function OfficialReportPrintView({
  data,
  fromDate,
  toDate,
}: {
  data: ReportData | undefined;
  fromDate: string;
  toDate: string;
}) {
  if (!data) return null;

  const isSingleDay = fromDate === toDate;
  const title = isSingleDay
    ? 'كشف الغيابات اليومي'
    : `كشف الغيابات للفترة من ${formatDate(fromDate)} إلى ${formatDate(toDate)}`;
  const printTime = new Date().toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div
      className="p-8 mx-auto"
      style={{
        fontFamily: 'Arial, sans-serif',
        maxWidth: '210mm',
        minHeight: '297mm',
        boxSizing: 'border-box',
      }}
    >
      {/* Header — بدون لون، شعار وعنوان أكبر */}
      <div
        className="pb-5 mb-6"
        style={{
          borderBottom: '2px solid #cbd5e1',
          marginLeft: -32,
          marginRight: -32,
          marginTop: -32,
          paddingTop: 24,
          paddingBottom: 24,
          paddingLeft: 32,
          paddingRight: 32,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, flexWrap: 'wrap' }}>
          <img
            src="/hospital-logo.png"
            alt="شعار مستشفى الحكيم العام"
            style={{ height: 112, width: 'auto', objectFit: 'contain' }}
          />
          <div className="text-center" style={{ color: '#0f172a' }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>وزارة الصحة</p>
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>دائرة صحة النجف الأشرف</p>
            <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 0 }}>مستشفى الحكيم العام</p>
          </div>
        </div>
        <h2
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            marginTop: 20,
            marginBottom: 4,
            textAlign: 'center',
            letterSpacing: '0.02em',
            color: '#0f172a',
            borderBottom: '2px solid #334155',
            paddingBottom: 10,
            display: 'inline-block',
            width: '100%',
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#475569', textAlign: 'center', marginTop: 10 }}>تاريخ الإصدار: {printTime}</p>
      </div>

      {/* KPIs — بطاقات بألوان مميزة (تركواز، كهرماني، بنفسجي، رمادي) */}
      <div className="grid grid-cols-4 gap-3 mb-6 text-sm">
        {[
          { value: data.kpis.total, label: 'إجمالي الغائبين', bg: '#dbeafe', border: '#1e40af', text: '#1e3a8a' },
          { value: data.kpis.morning, label: 'صباحي', bg: '#fef3c7', border: '#d97706', text: '#92400e' },
          { value: data.kpis.shifts, label: 'خفر', bg: '#ede9fe', border: '#7c3aed', text: '#5b21b6' },
          { value: data.kpis.departmentsCount, label: 'أقسام', bg: '#e2e8f0', border: '#475569', text: '#334155' },
        ].map((item, idx) => (
          <div
            key={idx}
            className="text-center rounded-lg"
            style={{
              backgroundColor: item.bg,
              border: `2px solid ${item.border}`,
              padding: '12px 8px',
              color: item.text,
            }}
          >
            <p style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 4 }}>{item.value}</p>
            <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>{item.label}</p>
          </div>
        ))}
      </div>

      {/* Table — رأس داكن وصفوف متناوبة */}
      <table
        className="w-full border-collapse"
        style={{ fontSize: '10pt', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden' }}
      >
        <thead>
          <tr style={{ backgroundColor: '#334155', color: '#fff' }}>
            <th style={{ border: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>م</th>
            <th style={{ border: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>الاسم الرباعي</th>
            <th style={{ border: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>العنوان الوظيفي</th>
            <th style={{ border: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>القسم</th>
            <th style={{ border: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>نوع الدوام</th>
            <th style={{ border: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>تاريخ الغياب</th>
            <th style={{ border: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {data.absences.map((row, i) => (
            <tr key={row.id} style={{ backgroundColor: i % 2 === 1 ? '#f1f5f9' : '#fff' }}>
              <td style={{ border: '1px solid #cbd5e1', padding: '8px', textAlign: 'center' }}>{i + 1}</td>
              <td style={{ border: '1px solid #cbd5e1', padding: '8px' }}>{row.fullName}</td>
              <td style={{ border: '1px solid #cbd5e1', padding: '8px' }}>{row.jobTitle}</td>
              <td style={{ border: '1px solid #cbd5e1', padding: '8px' }}>{row.departmentName}</td>
              <td style={{ border: '1px solid #cbd5e1', padding: '8px' }}>{WORK_TYPE_LABEL[row.workType] ?? row.workType}</td>
              <td style={{ border: '1px solid #cbd5e1', padding: '8px' }}>{formatDate(row.date)}</td>
              <td style={{ border: '1px solid #cbd5e1', padding: '8px' }}>{row.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer — توقيع مسؤول البصمة يمين، مدير المستشفى يسار */}
      <div className="mt-12 flex justify-between gap-8 pt-8" style={{ borderTop: '2px solid #cbd5e1' }}>
        <div
          className="flex-1 text-center rounded-lg"
          style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: 16 }}
        >
          <p style={{ fontWeight: 700, color: '#334155', marginBottom: 24 }}>توقيع مسؤول وحدة البصمة</p>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>الاسم: _________________________</p>
          <p style={{ fontSize: '0.85rem', color: '#475569' }}>التوقيع: _________________________</p>
        </div>
        <div
          className="flex-1 text-center rounded-lg"
          style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: 16 }}
        >
          <p style={{ fontWeight: 700, color: '#334155', marginBottom: 24 }}>توقيع مدير المستشفى / المسؤول الإداري</p>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 6 }}>الاسم: _________________________</p>
          <p style={{ fontSize: '0.85rem', color: '#475569' }}>التوقيع: _________________________</p>
        </div>
      </div>
    </div>
  );
}
