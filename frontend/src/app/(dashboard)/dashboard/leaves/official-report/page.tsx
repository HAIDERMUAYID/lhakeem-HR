'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, Printer, Calendar, Users, FileText, Clock, Building2, Sun, Moon } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/shared/page-skeleton';

const WORK_TYPE_LABEL: Record<string, string> = {
  MORNING: 'صباحي',
  SHIFTS: 'خفر',
};

type ReportData = {
  fromDate: string;
  toDate: string;
  kpis: {
    totalLeaves: number;
    employeesOnLeave: number;
    totalDays: number;
    hourlyLeavesCount: number;
    byWorkType: { morning: number; shifts: number };
    byDepartment: { departmentId: string; name: string; count: number }[];
    byLeaveType: { leaveTypeId: string; nameAr: string; count: number }[];
  };
  rows: {
    id: string;
    fullName: string;
    jobTitle: string;
    departmentName: string;
    workType: string;
    leaveTypeName: string;
    startDate: string;
    endDate: string;
    daysCount: number;
    hoursCount: number | null;
    isHourlyLeave: boolean;
    status: string;
    organizerName: string;
    reason: string | null;
  }[];
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatPrintDate(): string {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}، ${String(d.getHours() % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'ص' : 'م'}`;
}

function formatDaysAr(n: number): string {
  if (n === 1) return 'يوم';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوم`;
}

export default function LeaveOfficialReportPage() {
  const now = new Date();
  const [fromDate, setFromDate] = useState(() => now.toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => now.toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [status, setStatus] = useState('');
  const [workType, setWorkType] = useState('');

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/departments'),
  });
  const { data: leaveTypes } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => apiGet<{ id: string; nameAr: string }[]>('/api/leave-types'),
  });

  const params = new URLSearchParams();
  params.set('fromDate', fromDate);
  params.set('toDate', toDate);
  if (search.trim()) params.set('search', search.trim());
  if (departmentId) params.set('departmentId', departmentId);
  if (leaveTypeId) params.set('leaveTypeId', leaveTypeId);
  if (status) params.set('status', status);
  if (workType) params.set('workType', workType);

  const { data, isLoading } = useQuery({
    queryKey: ['leave-official-report', fromDate, toDate, search, departmentId, leaveTypeId, status, workType],
    queryFn: () => apiGet<ReportData>(`/api/leave-requests/official-report?${params}`),
    enabled: !!fromDate && !!toDate,
  });

  const handlePrint = () => window.print();
  const depts = departments ?? [];
  const types = leaveTypes ?? [];
  const hasData = (data?.rows?.length ?? 0) > 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .print-only { visibility: hidden; position: absolute; left: -9999px; }
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
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
            padding: 0 12px !important;
            margin: 0 !important;
            background: #fff !important;
            font-size: 10pt;
            color: #000;
          }
          .print-only table { page-break-inside: auto; }
          .print-only tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}} />

      <div className="no-print max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/dashboard/leaves" className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium mb-2">
            <ArrowRight className="h-4 w-4" />
            العودة إلى الإجازات
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">تقرير الإجازات الرسمي</h1>
          <p className="text-gray-500 mt-1">
            تقرير احترافي للفترة المحددة مع إحصائيات وجدول تفاصيل الإجازات — جاهز للطباعة والأرشفة
          </p>
        </div>

        <Card className="border-0 shadow-md">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">الفترة:</span>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">من تاريخ</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">إلى تاريخ</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">اسم الموظف / بحث</label>
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="rounded-xl border border-gray-200 px-3 py-2 text-sm w-40" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">القسم</label>
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm min-w-[140px]">
                  <option value="">كل الأقسام</option>
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">نوع الدوام</label>
                <select value={workType} onChange={(e) => setWorkType(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                  <option value="">الكل</option>
                  <option value="MORNING">صباحي</option>
                  <option value="SHIFTS">خفر</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">نوع الإجازة</label>
                <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm min-w-[120px]">
                  <option value="">الكل</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.nameAr}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">الحالة</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                  <option value="">الكل</option>
                  <option value="APPROVED">معتمدة</option>
                  <option value="PENDING">قيد الانتظار</option>
                  <option value="REJECTED">مرفوضة</option>
                </select>
              </div>
              <Button onClick={handlePrint} disabled={!hasData} className="gap-2">
                <Printer className="h-4 w-4" />
                طباعة / PDF
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <TableSkeleton rows={12} />
        ) : data ? (
          <>
            {/* KPI Cards - Screen */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 no-print">
              <Card className="bg-slate-50 border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-slate-600 mb-1">
                    <FileText className="h-4 w-4" />
                    <span className="text-xs font-medium">إجمالي الإجازات</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{data.kpis.totalLeaves}</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-blue-700 mb-1">
                    <Users className="h-4 w-4" />
                    <span className="text-xs font-medium">الموظفين المجازين</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">{data.kpis.employeesOnLeave}</p>
                </CardContent>
              </Card>
              <Card className="bg-emerald-50 border-emerald-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-emerald-700 mb-1">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs font-medium">إجمالي أيام الإجازة</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-900">{data.kpis.totalDays}</p>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-amber-700 mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs font-medium">إجازات زمنية (ساعات)</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-900">{data.kpis.hourlyLeavesCount}</p>
                </CardContent>
              </Card>
              <Card className="bg-sky-50 border-sky-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sky-700 mb-1">
                    <Sun className="h-4 w-4" />
                    <span className="text-xs font-medium">صباحي</span>
                  </div>
                  <p className="text-2xl font-bold text-sky-900">{data.kpis.byWorkType.morning}</p>
                </CardContent>
              </Card>
              <Card className="bg-violet-50 border-violet-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-violet-700 mb-1">
                    <Moon className="h-4 w-4" />
                    <span className="text-xs font-medium">خفر</span>
                  </div>
                  <p className="text-2xl font-bold text-violet-900">{data.kpis.byWorkType.shifts}</p>
                </CardContent>
              </Card>
            </div>

            {/* By department & by leave type - Screen */}
            {(data.kpis.byDepartment.length > 0 || data.kpis.byLeaveType.length > 0) && (
              <div className="grid md:grid-cols-2 gap-4 no-print">
                {data.kpis.byDepartment.length > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Building2 className="h-4 w-4" /> توزيع الإجازات حسب الأقسام
                      </h3>
                      <ul className="space-y-1 text-sm">
                        {data.kpis.byDepartment.slice(0, 8).map((d) => (
                          <li key={d.departmentId} className="flex justify-between">
                            <span>{d.name}</span>
                            <span className="font-medium">{d.count}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
                {data.kpis.byLeaveType.length > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4" /> حسب نوع الإجازة
                      </h3>
                      <ul className="space-y-1 text-sm">
                        {data.kpis.byLeaveType.slice(0, 8).map((t) => (
                          <li key={t.leaveTypeId} className="flex justify-between">
                            <span>{t.nameAr}</span>
                            <span className="font-medium">{t.count}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Table - Screen */}
            <Card className="overflow-hidden border-0 shadow-md">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-200">
                        <th className="text-right p-2.5 font-semibold border-l border-gray-200">م</th>
                        <th className="text-right p-2.5 font-semibold">الاسم الرباعي</th>
                        <th className="text-right p-2.5 font-semibold">العنوان الوظيفي</th>
                        <th className="text-right p-2.5 font-semibold">القسم</th>
                        <th className="text-right p-2.5 font-semibold">نوع الدوام</th>
                        <th className="text-right p-2.5 font-semibold">نوع الإجازة</th>
                        <th className="text-right p-2.5 font-semibold">من تاريخ</th>
                        <th className="text-right p-2.5 font-semibold">إلى تاريخ</th>
                        <th className="text-right p-2.5 font-semibold">الأيام / الساعات</th>
                        <th className="text-right p-2.5 font-semibold">اسم منظم الإجازة</th>
                        <th className="text-right p-2.5 font-semibold">السبب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row, i) => (
                        <tr key={row.id} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                          <td className="p-2.5 text-center border-l border-gray-100" dir="ltr">{i + 1}</td>
                          <td className="p-2.5">{row.fullName}</td>
                          <td className="p-2.5">{row.jobTitle}</td>
                          <td className="p-2.5">{row.departmentName}</td>
                          <td className="p-2.5">{WORK_TYPE_LABEL[row.workType] ?? row.workType}</td>
                          <td className="p-2.5">{row.leaveTypeName}</td>
                          <td className="p-2.5" dir="ltr">{formatDate(row.startDate)}</td>
                          <td className="p-2.5" dir="ltr">{formatDate(row.endDate)}</td>
                          <td className="p-2.5" dir="ltr">
                            {row.isHourlyLeave && row.hoursCount != null && row.hoursCount > 0 ? `${row.hoursCount} ساعة` : formatDaysAr(row.daysCount ?? 0)}
                          </td>
                          <td className="p-2.5">{row.organizerName ?? '—'}</td>
                          <td className="p-2.5 max-w-[120px] truncate" title={row.reason ?? ''}>{row.reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-gray-500 text-center py-8">اختر الفترة ثم انقر تطبيق أو انتظر تحميل البيانات.</p>
        )}
      </div>

      {/* Print-only view */}
      {data && hasData && (
        <div className="print-only hidden">
          <LeaveReportPrintView data={data} />
        </div>
      )}
    </>
  );
}

function LeaveReportPrintView({ data }: { data: ReportData }) {
  const printDate = formatPrintDate();
  const borderColor = '#1e293b';

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '10pt' }}>
      {/* Header */}
      <div style={{ borderBottom: `2px solid ${borderColor}`, paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
          <img src="/hospital-logo.png" alt="شعار المستشفى" style={{ height: 56, width: 'auto', objectFit: 'contain' }} />
          <div className="text-center" style={{ color: '#0f172a' }}>
            <p style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 2 }}>وزارة الصحة</p>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 2 }}>دائرة صحة النجف الأشرف</p>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 0 }}>مستشفى الحكيم العام</p>
          </div>
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 12, marginBottom: 4, textAlign: 'center', color: '#0f172a' }}>
          تقرير الإجازات للفترة من {formatDate(data.fromDate)} إلى {formatDate(data.toDate)}
        </h1>
        <p style={{ fontSize: '0.8rem', color: '#475569', textAlign: 'center' }}>تاريخ الطباعة: {printDate}</p>
      </div>

      {/* KPIs - Print */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16, fontSize: '9pt' }}>
        <div style={{ border: '1px solid #cbd5e1', padding: 8, textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>إجمالي الإجازات</p>
          <p style={{ margin: 0, fontSize: '1.1rem' }}>{data.kpis.totalLeaves}</p>
        </div>
        <div style={{ border: '1px solid #cbd5e1', padding: 8, textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>الموظفين المجازين</p>
          <p style={{ margin: 0, fontSize: '1.1rem' }}>{data.kpis.employeesOnLeave}</p>
        </div>
        <div style={{ border: '1px solid #cbd5e1', padding: 8, textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>إجمالي أيام الإجازة</p>
          <p style={{ margin: 0, fontSize: '1.1rem' }}>{data.kpis.totalDays}</p>
        </div>
        <div style={{ border: '1px solid #cbd5e1', padding: 8, textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>إجازات زمنية (ساعات)</p>
          <p style={{ margin: 0, fontSize: '1.1rem' }}>{data.kpis.hourlyLeavesCount}</p>
        </div>
      </div>

      {/* Table */}
      <table className="w-full border-collapse" style={{ border: `1px solid ${borderColor}`, fontSize: '9pt' }}>
        <thead>
          <tr style={{ backgroundColor: '#334155', color: '#fff' }}>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>م</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>الاسم الرباعي</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>العنوان الوظيفي</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>القسم</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>نوع الدوام</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>نوع الإجازة</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>من</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>إلى</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>أيام/ساعات</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>اسم منظم الإجازة</th>
            <th style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'right' }}>السبب</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={row.id} style={{ backgroundColor: i % 2 === 1 ? '#f8fafc' : '#fff' }}>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px', textAlign: 'center' }}>{i + 1}</td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>{row.fullName}</td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>{row.jobTitle}</td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>{row.departmentName}</td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>{WORK_TYPE_LABEL[row.workType] ?? row.workType}</td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>{row.leaveTypeName}</td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>{formatDate(row.startDate)}</td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>{formatDate(row.endDate)}</td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>
                {row.isHourlyLeave && row.hoursCount != null && row.hoursCount > 0 ? `${row.hoursCount} ساعة` : formatDaysAr(row.daysCount ?? 0)}
              </td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>{row.organizerName ?? '—'}</td>
              <td style={{ border: `1px solid ${borderColor}`, padding: '4px 6px' }}>{row.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer signatures */}
      <div style={{ marginTop: 32, paddingTop: 12, borderTop: `1px solid ${borderColor}`, display: 'flex', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ flex: 1, textAlign: 'center', border: `1px solid ${borderColor}`, padding: 12, borderRadius: 4 }}>
          <p style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.9rem' }}>مسؤول الموارد البشرية / البصمة</p>
          <p style={{ fontSize: '0.8rem', marginBottom: 4 }}>التوقيع: _________________________</p>
        </div>
        <div style={{ flex: 1, textAlign: 'center', border: `1px solid ${borderColor}`, padding: 12, borderRadius: 4 }}>
          <p style={{ fontWeight: 700, marginBottom: 8, fontSize: '0.9rem' }}>مدير المستشفى أو الإدارة</p>
          <p style={{ fontSize: '0.8rem', marginBottom: 4 }}>التوقيع: _________________________</p>
        </div>
      </div>
    </div>
  );
}
