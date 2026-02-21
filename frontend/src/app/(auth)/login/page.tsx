'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Upload,
  Building2,
  Fingerprint,
  CalendarDays,
  Calendar,
  CalendarRange,
  UserX,
  ClipboardList,
  BarChart3,
  Settings,
  UserCog,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppLogo } from '@/components/layout/app-logo';
import { CopyrightFooter } from '@/components/layout/copyright-footer';
import { loginSchema, type LoginInput } from '@/lib/schemas';

const SYSTEM_NAME = 'إدارة الموارد البشرية لمستشفى الحكيم العام';

/** مزايا النظام من القائمة الجانبية والنظام */
const FEATURES = [
  { icon: LayoutDashboard, label: 'لوحة التحكم' },
  { icon: Users, label: 'الموظفين' },
  { icon: ClipboardCheck, label: 'إكمال البيانات' },
  { icon: Upload, label: 'الاستيراد' },
  { icon: Building2, label: 'الأقسام' },
  { icon: Fingerprint, label: 'أجهزة البصمة' },
  { icon: CalendarDays, label: 'تقويم وحدة البصمة' },
  { icon: Calendar, label: 'الإجازات' },
  { icon: CalendarRange, label: 'تقويم الإجازات' },
  { icon: Calendar, label: 'أنواع الإجازات' },
  { icon: UserX, label: 'الغيابات' },
  { icon: CalendarDays, label: 'العطل' },
  { icon: ClipboardList, label: 'جداول الدوام' },
  { icon: BarChart3, label: 'التقارير' },
  { icon: Settings, label: 'الإعدادات' },
  { icon: UserCog, label: 'المستخدمون' },
  { icon: FileText, label: 'سجل التدقيق' },
];

const STAGGER_DELAY = 0.12;

export default function LoginPage() {
  const router = useRouter();
  const [apiError, setApiError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (data: LoginInput) => {
    setApiError('');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: data.username.trim(), password: data.password }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || (res.status === 500 ? 'خطأ من الخادم (500) — راجع سجلات الـ API أو تأكد من تشغيل seed' : 'حدث خطأ'));
      if (result.access_token) {
        localStorage.setItem('token', result.access_token);
        localStorage.setItem('user', JSON.stringify(result.user || {}));
        document.cookie = `token=${result.access_token}; path=/; max-age=604800`;
      }
      router.push('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ';
      setApiError(msg === 'Failed to fetch' ? 'تعذر الاتصال بالخادم - تأكد من تشغيل الخدمة الخلفية (Backend) على المنفذ 3001' : msg);
    }
  };

  return (
    <main className="min-h-screen flex flex-col sm:flex-row bg-gray-100">
      {/* القسم الأيسر: عرض المزايا بتسلسل */}
      <div className="hidden sm:flex sm:flex-1 min-h-screen flex-col justify-center px-6 lg:px-10 xl:px-14 py-8 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-white/5" />
          <div className="absolute bottom-32 right-20 w-96 h-96 rounded-full bg-white/5" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-white/10" />
        </div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10"
        >
          {/* شعار متحرك — حركة كبيرة وواضحة */}
          <motion.div
            className="flex items-center gap-4 mb-6"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: [0, -12, 0],
            }}
            transition={{
              scale: { type: 'spring', stiffness: 260, damping: 20 },
              opacity: { duration: 0.4 },
              y: {
                repeat: Infinity,
                duration: 2.8,
                ease: 'easeInOut',
              },
            }}
          >
            <motion.div
              animate={{
                rotate: [0, 3, -3, 0],
                scale: [1, 1.08, 1],
              }}
              transition={{
                rotate: { repeat: Infinity, duration: 4, ease: 'easeInOut' },
                scale: { repeat: Infinity, duration: 2.5, ease: 'easeInOut' },
              }}
            >
              <AppLogo size={56} animated />
            </motion.div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-white leading-tight">
                {SYSTEM_NAME}
              </h1>
            </div>
          </motion.div>

          <p className="text-white/90 text-sm max-w-md mb-6">
            نظام متكامل للإجازات، الموظفين، البصمة، الغيابات، التقارير والصلاحيات.
          </p>

          <h2 className="text-sm font-semibold text-white/90 uppercase tracking-wider mb-3">
            مزايا النظام
          </h2>

          {/* المزايا تظهر بشكل تسلسلي متتابع */}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {FEATURES.map(({ icon: Icon, label }, i) => (
              <motion.div
                key={`${label}-${i}`}
                initial={{ opacity: 0, x: -32 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.35,
                  delay: 0.2 + i * STAGGER_DELAY,
                  ease: 'easeOut',
                }}
                className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 hover:bg-white/15 hover:border-white/20 transition-colors"
              >
                <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-white" />
                </span>
                <span className="text-white font-medium text-sm">{label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* القسم الأيمن: تسجيل الدخول */}
      <div className="flex-1 min-h-screen flex flex-col items-center justify-center px-4 sm:px-8 py-10 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full max-w-[380px]"
        >
          <div className="sm:hidden flex flex-col items-center mb-6">
            <motion.div
              animate={{ y: [0, -6, 0], scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
            >
              <AppLogo size={56} animated />
            </motion.div>
            <h1 className="text-base font-bold text-gray-900 mt-3 text-center">
              {SYSTEM_NAME}
            </h1>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">مرحباً بك</h2>
          <p className="text-gray-500 text-sm mb-6">سجّل الدخول إلى حسابك لبدء الاستخدام</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {apiError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">
                {apiError}
              </div>
            )}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1.5">
                اسم المستخدم
              </label>
              <Input
                id="username"
                type="text"
                placeholder="أدخل اسم المستخدم"
                dir="ltr"
                autoComplete="username"
                className={`rounded-xl ${errors.username ? 'border-red-300' : ''}`}
                {...register('username')}
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                كلمة المرور
              </label>
              <Input
                id="password"
                type="password"
                placeholder="············"
                autoComplete="current-password"
                className={`rounded-xl ${errors.password ? 'border-red-300' : ''}`}
                {...register('password')}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl min-h-[48px] py-3 text-base font-semibold"
            >
              {isSubmitting ? 'جاري التحقق...' : 'دخول'}
            </Button>
          </form>

          <CopyrightFooter variant="light" className="mt-8 text-gray-500" />
        </motion.div>
      </div>
    </main>
  );
}
