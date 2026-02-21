'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { User, Mail, Shield, Building2, Wallet, KeyRound } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiPost } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type UserData = { id: string; name: string; username?: string; email?: string; role: string; departmentId?: string; permissions?: string[] };

const roleLabel: Record<string, string> = {
  ADMIN: 'مدير النظام',
  LEAVE_MANAGER: 'مدير الإجازات',
  LEAVE_OFFICER: 'موظف إجازات',
  FINGERPRINT: 'موظف بصمة',
  FINGERPRINT_MANAGER: 'مدير البصمة',
  MANAGER: 'مدير قسم',
  OFFICE: 'إدارة',
};

export default function SettingsPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const queryClient = useQueryClient();

  const changePasswordMutation = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiPost<{ message: string }>('/api/auth/change-password', body),
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور بنجاح');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const accrualMutation = useMutation({
    mutationFn: () => apiPost<{ accrued: number; amountPerEmployee: number; message: string }>('/api/balance/accrual', {}),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const dailyAccrualMutation = useMutation({
    mutationFn: () => apiPost<{ accrued: number; amountPerEmployee: number; message: string }>('/api/balance/daily-accrual', {}),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        setUser(JSON.parse(u));
      } catch {
        setUser(null);
      }
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900">الإعدادات</h1>
        <p className="text-gray-500 mt-1">إعدادات الحساب والنظام</p>
      </div>

      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            معلومات الحساب
          </h3>
          {user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">اسم المستخدم</p>
                  <p className="font-medium">{user.username || user.email || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">الاسم</p>
                  <p className="font-medium">{user.name}</p>
                </div>
              </div>
              {(user.email || user.username) && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <Mail className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">البريد الإلكتروني</p>
                    <p className="font-medium">{user.email || '—'}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <Shield className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">الدور</p>
                  <p className="font-medium">{roleLabel[user.role] || user.role}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">جاري تحميل البيانات...</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            تغيير كلمة المرور
          </h3>
          <div className="space-y-4 max-w-sm">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور الحالية</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور الجديدة</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 أحرف على الأقل"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">تأكيد كلمة المرور الجديدة</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600 mt-1">كلمة المرور غير متطابقة</p>
              )}
            </div>
            <Button
              onClick={() => {
                if (newPassword !== confirmPassword) {
                  toast.error('كلمة المرور غير متطابقة');
                  return;
                }
                changePasswordMutation.mutate({ currentPassword, newPassword });
              }}
              disabled={
                changePasswordMutation.isPending ||
                !currentPassword ||
                !newPassword ||
                newPassword !== confirmPassword ||
                newPassword.length < 6
              }
              className="min-h-[44px]"
            >
              {changePasswordMutation.isPending ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(user?.permissions?.includes('ADMIN') || user?.permissions?.includes('BALANCE_ACCRUAL')) && (
        <>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                استحقاق الرصيد اليومي (تحديث تلقائي)
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                إضافة استحقاق يوم واحد لرصيد الموظفين النشطين الذين لم يُحدد لهم «رصيد لغاية تاريخ». الرصيد المعروض في القوائم وملف الموظف يُحسب تلقائياً حتى تاريخ اليوم عند كل تحميل.
              </p>
              <Button
                onClick={() => dailyAccrualMutation.mutate()}
                disabled={dailyAccrualMutation.isPending}
                variant="outline"
                className="mr-2 min-h-[44px]"
              >
                {dailyAccrualMutation.isPending ? 'جاري التنفيذ...' : 'تشغيل الاستحقاق اليومي الآن'}
              </Button>
              <span className="text-xs text-gray-500">يمكن جدولة هذا الطلب يومياً (cron) على نفس الرابط: POST /api/balance/daily-accrual</span>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                استحقاق الرصيد الشهري
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                إضافة رصيد الإجازات الشهري لجميع الموظفين النشطين بناءً على أنواع الإجازات
              </p>
              <Button
                onClick={() => accrualMutation.mutate()}
                disabled={accrualMutation.isPending}
                className="min-h-[44px]"
              >
                {accrualMutation.isPending ? 'جاري التنفيذ...' : 'تشغيل الاستحقاق الشهري'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            نظام إدارة الإجازات
          </h3>
          <p className="text-sm text-gray-500">
            مستشفى الحكيم • نظام إدارة الإجازات والدوام والغيابات
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
