'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Users,
  Calendar,
  UserX,
  FileText,
  ClipboardList,
  CalendarDays,
  ArrowLeft,
  FileDown,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { hasAnyPermission } from '@/lib/permissions';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#0F4C81', '#2D7AB8', '#0D9488', '#D97706'];

type ReportCard = {
  id: string;
  title: string;
  description: string;
  icon: typeof FileText;
  href: string;
  permission: string | string[];
  color: string;
};

const REPORT_CARDS: ReportCard[] = [
  {
    id: 'absences',
    title: 'كشف الغيابات',
    description: 'تقرير رسمي للغيابات لفترة محددة مع ملخص وطباعة A4',
    icon: UserX,
    href: '/dashboard/absences/official-report',
    permission: ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER'],
    color: 'from-violet-500 to-violet-700',
  },
  {
    id: 'leaves',
    title: 'تقرير الإجازات الرسمي',
    description: 'إجازات لفترة معينة مع KPIs وطباعة رسمية',
    icon: Calendar,
    href: '/dashboard/leaves/official-report',
    permission: ['LEAVES_VIEW', 'LEAVES_PRINT', 'REPORTS_VIEW'],
    color: 'from-primary-500 to-primary-700',
  },
  {
    id: 'schedules',
    title: 'جدول الدوام الشهري',
    description: 'جداول الدوام حسب الشهر والقسم مع إمكانية الطباعة',
    icon: ClipboardList,
    href: '/dashboard/schedules',
    permission: 'SCHEDULES_VIEW',
    color: 'from-green-500 to-green-700',
  },
  {
    id: 'holidays',
    title: 'العطل الرسمية',
    description: 'عرض وإدارة العطل',
    icon: CalendarDays,
    href: '/dashboard/holidays',
    permission: 'LEAVES_VIEW',
    color: 'from-amber-500 to-amber-700',
  },
];

export default function ReportsPage() {
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    try {
      const u = localStorage.getItem('user');
      setPermissions(JSON.parse(u || '{}')?.permissions ?? []);
    } catch {
      setPermissions([]);
    }
  }, []);

  const visibleCards = REPORT_CARDS.filter((c) => hasAnyPermission(permissions, c.permission));

  const { data: employees } = useQuery({
    queryKey: ['employees-report'],
    queryFn: () =>
      apiGet<{
        data: { id: string; fullName: string; leaveBalance: string; jobTitle?: string; department?: { name: string } }[];
        total: number;
      }>('/api/employees?limit=500'),
    enabled: hasAnyPermission(permissions, ['REPORTS_VIEW', 'REPORTS_EXPORT', 'EMPLOYEES_VIEW']),
  });

  const empList = employees?.data ?? [];

  const handleExportPdf = () => {
    const doc = new jsPDF();
    doc.text('تقرير الموظفين - مستشفى الحكيم العام', 14, 15);
    doc.text(new Date().toLocaleDateString('ar-EG'), 14, 22);
    autoTable(doc, {
      head: [['الاسم', 'العنوان', 'القسم', 'رصيد الإجازات']],
      body: empList.map((e) => [
        e.fullName,
        e.jobTitle ?? '',
        e.department?.name ?? '',
        String(e.leaveBalance),
      ]),
      startY: 28,
    });
    doc.save('تقرير-موظفين-' + new Date().toISOString().slice(0, 10) + '.pdf');
  };

  const handleExportExcel = () => {
    const csv =
      'الاسم,العنوان الوظيفي,القسم,رصيد الإجازات\n' +
      empList
        .map(
          (e) =>
            `"${e.fullName}","${e.jobTitle ?? ''}","${e.department?.name ?? ''}","${e.leaveBalance}"`,
        )
        .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'تقرير-الموظفين-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  };

  const deptCounts = empList.reduce((acc: Record<string, number>, emp) => {
    const d = emp.department?.name || 'بدون قسم';
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});
  const barData = Object.entries(deptCounts).map(([name, count]) => ({ name, العدد: count }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900">مركز التقارير</h1>
        <p className="text-gray-500 mt-1">
          اختر التقرير ثم حدد الفترة أو الفلاتر ثم معاينة وطباعة/تصدير
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link href={card.href}>
                <Card className="h-full border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden group">
                  <CardContent className="p-6">
                    <div
                      className={`inline-flex rounded-xl p-3 bg-gradient-to-br ${card.color} mb-4`}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{card.title}</h3>
                    <p className="text-sm text-gray-500 mb-4">{card.description}</p>
                    <span className="text-primary-600 text-sm font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                      عرض التقرير
                      <ArrowLeft className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {hasAnyPermission(permissions, ['REPORTS_VIEW', 'REPORTS_EXPORT', 'EMPLOYEES_VIEW']) && (
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary-600" />
              تقرير الموظفين (تصدير)
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              تصدير قائمة الموظفين مع العنوان والقسم ورصيد الإجازات إلى PDF أو Excel
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-2">
                <FileDown className="h-4 w-4" /> تصدير PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-2">
                <FileDown className="h-4 w-4" /> تصدير Excel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {hasAnyPermission(permissions, ['REPORTS_VIEW', 'EMPLOYEES_VIEW']) && barData.length > 0 && (
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">نظرة عامة: الموظفين حسب القسم</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={80} />
                  <Tooltip />
                  <Bar dataKey="العدد" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {visibleCards.length === 0 && (
        <Card className="border-0 shadow-md">
          <CardContent className="py-16 text-center text-gray-500">
            لا يوجد لديك صلاحية لعرض أي تقرير. تواصل مع المسؤول.
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
