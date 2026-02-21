'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Users, Calendar, UserX, Building2, ChevronLeft, Clock, TrendingUp } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { hasAnyPermission } from '@/lib/permissions';

const COLORS = ['#0F4C81', '#2D7AB8', '#0D9488', '#D97706'];

const stats = [
  { title: 'الموظفين', key: 'employees', href: '/dashboard/employees', icon: Users, color: 'from-primary-500 to-primary-700', bg: 'bg-primary-50', permission: 'EMPLOYEES_VIEW' as const },
  { title: 'الأقسام', key: 'departments', href: '/dashboard/departments', icon: Building2, color: 'from-green-500 to-green-700', bg: 'bg-green-50', permission: 'DEPARTMENTS_MANAGE' as const },
  { title: 'إجازات قيد الانتظار', key: 'leaves', href: '/dashboard/leaves', icon: Clock, color: 'from-amber-500 to-amber-700', bg: 'bg-amber-50', permission: 'LEAVES_VIEW' as const },
  { title: 'غيابات الشهر', key: 'absences', href: '/dashboard/absences', icon: UserX, color: 'from-violet-500 to-violet-700', bg: 'bg-violet-50', permission: ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER'] as const },
];

export default function DashboardPage() {
  const [userName, setUserName] = useState<string>('');
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    try {
      const u = localStorage.getItem('user');
      const parsed = u ? JSON.parse(u) : null;
      setUserName(parsed?.name ?? '');
      setPermissions(parsed?.permissions ?? []);
    } catch {
      setUserName('');
      setPermissions([]);
    }
  }, []);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const { data: employees } = useQuery({
    queryKey: ['employees-stats'],
    queryFn: () => apiGet<{ total: number }>('/api/employees?page=1&limit=1'),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiGet<unknown[]>('/api/departments'),
  });
  const { data: leaveRequests } = useQuery({
    queryKey: ['leave-requests-pending'],
    queryFn: () => apiGet<{ data: { status: string }[] }>('/api/leave-requests?limit=500'),
  });
  const { data: absencesData } = useQuery({
    queryKey: ['absences-month'],
    queryFn: () =>
      apiGet<{ total: number }>(
        `/api/absences?page=1&limit=1&fromDate=${monthStart.toISOString()}&toDate=${monthEnd.toISOString()}`
      ),
  });

  const pendingLeaves = (leaveRequests?.data ?? []).filter((r) => r.status === 'PENDING').length;

  const counts = {
    employees: employees?.total ?? 0,
    departments: Array.isArray(departments) ? departments.length : 0,
    leaves: pendingLeaves,
    absences: absencesData?.total ?? 0,
  };

  const isLoading = employees === undefined && departments === undefined;
  const visibleStats = stats.filter((s) => hasAnyPermission(permissions, s.permission));

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {userName ? `مرحباً، ${userName}` : 'مرحباً بك'}
          </h1>
          <p className="text-gray-500 mt-1">نظرة عامة على نظام الموارد البشرية</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-primary-600 bg-primary-50 px-4 py-2 rounded-xl">
          <TrendingUp className="h-4 w-4" />
          <span>آخر تحديث: الآن</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleStats.map((stat, i) => {
          const Icon = stat.icon;
          const value = counts[stat.key as keyof typeof counts] ?? '-';
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link href={stat.href}>
                <Card className="card-hover overflow-hidden border-0 shadow-md h-full group">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                        <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
                      </div>
                      <div className={`rounded-2xl p-3 bg-gradient-to-br ${stat.color} shadow-md group-hover:scale-105 transition-transform`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-4 text-primary-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronLeft className="h-4 w-4" />
                      عرض التفاصيل
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <Card className="border-0 shadow-md overflow-hidden">
        <CardHeader>
          <CardTitle>طلبات الإجازات حسب الحالة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            {(() => {
              const data = [
                { name: 'قيد الانتظار', value: (leaveRequests?.data ?? []).filter((r) => r.status === 'PENDING').length },
                { name: 'معتمدة', value: (leaveRequests?.data ?? []).filter((r) => r.status === 'APPROVED').length },
                { name: 'مرفوضة', value: (leaveRequests?.data ?? []).filter((r) => r.status === 'REJECTED').length },
              ].filter((d) => d.value > 0);
              return data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">لا توجد بيانات</div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle>اختصارات سريعة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {visibleStats.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.title}
                  href={s.href}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 p-4 hover:border-primary-200 hover:bg-primary-50/50 transition-all duration-200"
                >
                  <div className={`rounded-xl p-2 ${s.bg}`}>
                    <Icon className="h-5 w-5 text-primary-600" />
                  </div>
                  <span className="font-medium text-gray-900">{s.title}</span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
