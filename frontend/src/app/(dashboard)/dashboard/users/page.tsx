'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { UserCog, Shield, UserPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPut, apiPost } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { CanDo } from '@/components/shared/can-do';
import { useHasPermission } from '@/hooks/use-permissions';
import { TableSkeleton } from '@/components/shared/page-skeleton';

type User = {
  id: string;
  username?: string;
  email?: string;
  name: string;
  role: string;
  permissions: string[];
  department?: { name: string };
  assignedDepartmentIds?: string[];
  assignedDepartments?: { id: string; name: string }[];
};

const PERMISSION_LABELS: Record<string, string> = {
  LEAVES_APPROVE: 'اعتماد/رفض الإجازات',
  ABSENCES_CREATE: 'تسجيل الغياب',
  ABSENCES_CANCEL: 'إلغاء الغياب',
  AUDIT_VIEW: 'عرض سجل التدقيق',
  BALANCE_ACCRUAL: 'استحقاق الرصيد الشهري',
  USERS_MANAGE: 'إدارة المستخدمين',
  EMPLOYEES_VIEW: 'عرض الموظفين',
  EMPLOYEES_MANAGE: 'إدارة الموظفين',
  DEPARTMENTS_MANAGE: 'إدارة الأقسام',
  LEAVE_TYPES_MANAGE: 'إدارة أنواع الإجازات',
  LEAVES_VIEW: 'عرض الإجازات',
  LEAVES_CREATE: 'إنشاء طلب إجازة',
  REPORTS_VIEW: 'عرض التقارير',
  SETTINGS_VIEW: 'الإعدادات',
  SCHEDULES_VIEW: 'عرض جداول الدوام',
  SCHEDULES_MANAGE: 'إدارة جداول الدوام',
  FINGERPRINT_OFFICER: 'موظف بصمة (كشوف الغياب)',
  FINGERPRINT_MANAGER: 'مدير البصمة (مصادقة الكشوف)',
  ADMIN: 'صلاحية كاملة',
};

const roleLabels: Record<string, string> = {
  ADMIN: 'مدير النظام',
  LEAVE_MANAGER: 'مدير الإجازات',
  LEAVE_OFFICER: 'موظف إجازات',
  FINGERPRINT: 'موظف بصمة',
  FINGERPRINT_MANAGER: 'مدير البصمة',
  MANAGER: 'مدير قسم',
  OFFICE: 'إدارة',
};

const ROLES: { value: string; label: string }[] = [
  { value: 'ADMIN', label: 'مدير النظام' },
  { value: 'LEAVE_MANAGER', label: 'مدير الإجازات' },
  { value: 'LEAVE_OFFICER', label: 'موظف إجازات' },
  { value: 'FINGERPRINT', label: 'موظف بصمة' },
  { value: 'FINGERPRINT_MANAGER', label: 'مدير البصمة' },
  { value: 'MANAGER', label: 'مدير قسم' },
  { value: 'OFFICE', label: 'إدارة' },
];

export default function UsersPage() {
  const canManageUsers = useHasPermission('USERS_MANAGE');
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    jobCode: '',
    role: 'MANAGER' as string,
    departmentId: '',
  });
  const queryClient = useQueryClient();

  const { data: users = [], isLoading, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<User[]>('/api/users'),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-users'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/departments'),
  });

  const { data: permsData } = useQuery({
    queryKey: ['permissions'],
    queryFn: () =>
      apiGet<{
        list: { code: string; label: string }[];
        dependencies?: Record<string, string[]>;
        modules?: Record<string, string[]>;
      }>('/api/auth/permissions'),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof createForm) =>
      apiPost<{ id: string }>('/api/users', {
        username: body.username.trim(),
        password: body.password,
        name: body.name.trim(),
        email: body.email.trim() || undefined,
        phone: body.phone.trim() || undefined,
        jobCode: body.jobCode.trim() || undefined,
        role: body.role,
        departmentId: body.departmentId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateOpen(false);
      setCreateForm({
        username: '',
        password: '',
        name: '',
        email: '',
        phone: '',
        jobCode: '',
        role: 'MANAGER',
        departmentId: '',
      });
      toast.success('تم إضافة المستخدم. يمكنك تعيين الصلاحيات من زر "الصلاحيات".');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      permissions,
      departmentIds,
    }: {
      id: string;
      permissions: string[];
      departmentIds?: string[];
    }) => {
      await apiPut(`/api/users/${id}/permissions`, { permissions });
      if (departmentIds !== undefined) {
        await apiPut(`/api/users/${id}/department-assignments`, { departmentIds });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditOpen(false);
      setSelectedUser(null);
      toast.success('تم حفظ التعديلات');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (user: User) => {
    setSelectedUser(user);
    setSelectedPerms(user.permissions ?? []);
    setSelectedDeptIds(user.assignedDepartmentIds ?? []);
    setEditOpen(true);
  };

  const togglePerm = (code: string) => {
    setSelectedPerms((p) =>
      p.includes(code) ? p.filter((x) => x !== code) : [...p, code]
    );
  };

  const permList = permsData?.list ?? Object.entries(PERMISSION_LABELS).map(([code, label]) => ({ code, label }));
  const dependencies: Record<string, string[]> = permsData?.dependencies ?? {};
  const modules: Record<string, string[]> = permsData?.modules ?? {};
  const labelByCode = Object.fromEntries(permList.map((p) => [p.code, p.label]));
  const permByModule =
    Object.keys(modules).length > 0
      ? Object.entries(modules).map(([moduleName, codes]) => ({
          module: moduleName,
          permissions: codes
            .filter((code) => labelByCode[code] || code === 'ADMIN')
            .map((code) => ({ code, label: labelByCode[code] ?? code, deps: dependencies[code] })),
        }))
      : [
          {
            module: '',
            permissions: permList.map((p) => ({ code: p.code, label: p.label, deps: dependencies[p.code] })),
          },
        ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المستخدمون</h1>
          <p className="text-gray-500 mt-1">إدارة المستخدمين وصلاحياتهم</p>
        </div>
        <CanDo permission="USERS_MANAGE">
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            إضافة مستخدم
          </Button>
        </CanDo>
      </div>

      <Card className="overflow-hidden border-0 shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : error ? (
            <ErrorState
              message="حدث خطأ في تحميل المستخدمين"
              onRetry={() => refetch()}
            />
          ) : users.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title="لا يوجد مستخدمون"
              description="أضف مستخدمين للوصول إلى النظام وصلاحياتهم"
              actionLabel={canManageUsers ? 'إضافة مستخدم' : undefined}
              actionIcon={UserPlus}
              onAction={canManageUsers ? () => setCreateOpen(true) : undefined}
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map((user, i) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-gray-50/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary-100 flex items-center justify-center">
                      <UserCog className="h-6 w-6 text-primary-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.username || user.email || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {roleLabels[user.role] || user.role} • {user.department?.name ?? '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 max-w-xs">
                    {(user.permissions ?? []).slice(0, 4).map((p) => (
                      <span
                        key={p}
                        className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                      >
                        {PERMISSION_LABELS[p] || p}
                      </span>
                    ))}
                    {(user.permissions ?? []).length > 4 && (
                      <span className="text-xs text-gray-400">+{user.permissions!.length - 4}</span>
                    )}
                  </div>
                  <CanDo permission="USERS_MANAGE">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(user)} className="min-h-[44px]">
                      <Shield className="h-4 w-4 ml-1" />
                      الصلاحيات
                    </Button>
                  </CanDo>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="إضافة مستخدم جديد"
        className="max-w-4xl w-full"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">اسم المستخدم (للدخول) *</label>
              <Input
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="مثال: ahmed.hr"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور *</label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="6 أحرف على الأقل"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم *</label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="الاسم الكامل"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني (اختياري)</label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف (اختياري)</label>
              <Input
                value={createForm.phone}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="07xxxxxxxx"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">كود وظيفي (اختياري)</label>
              <Input
                value={createForm.jobCode}
                onChange={(e) => setCreateForm((f) => ({ ...f, jobCode: e.target.value }))}
                placeholder="مثال: HR-01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الدور *</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">القسم (اختياري)</label>
              <select
                value={createForm.departmentId}
                onChange={(e) => setCreateForm((f) => ({ ...f, departmentId: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">— لا يوجد —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-4 border-t border-gray-100">
            <Button
              onClick={() => createMutation.mutate(createForm)}
              disabled={
                createMutation.isPending ||
                !createForm.username.trim() ||
                !createForm.password ||
                createForm.password.length < 6 ||
                !createForm.name.trim()
              }
            >
              {createMutation.isPending ? 'جاري الإضافة...' : 'إضافة المستخدم'}
            </Button>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => { setEditOpen(false); setSelectedUser(null); }}
        title={`صلاحيات: ${selectedUser?.name ?? ''}`}
        className="max-w-5xl w-full"
      >
        {selectedUser && (
          <div className="flex flex-col min-h-0">
            {/* شريط المستخدم والدور */}
            <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-100">
              <p className="text-sm text-gray-500">{selectedUser.username || selectedUser.email || '—'}</p>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-100">
                {roleLabels[selectedUser.role] || selectedUser.role}
              </span>
            </div>

            {/* المحتوى الرئيسي: شبكة أفقية (لاندسكيب) */}
            <div className="flex-1 overflow-y-auto py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {permByModule.map(({ module: moduleName, permissions: perms }) => (
                  <div
                    key={moduleName || 'all'}
                    className="rounded-2xl border border-gray-100 bg-gray-50/50 p-4 shadow-soft hover:border-primary-100/50 transition-colors"
                  >
                    {moduleName && (
                      <p className="text-xs font-semibold text-primary-600 uppercase tracking-wider mb-3 pb-2 border-b border-primary-100/50">
                        {moduleName}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {perms.map(({ code, label, deps }) => (
                        <label
                          key={code}
                          className="flex flex-col gap-0.5 p-2.5 rounded-xl hover:bg-white/80 cursor-pointer transition-colors border border-transparent hover:border-gray-200/80"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedPerms.includes(code)}
                              onChange={() => togglePerm(code)}
                              className="h-4 w-4 rounded border-2 border-gray-300 text-primary-500 focus:ring-2 focus:ring-primary-200 focus:ring-offset-0"
                            />
                            <span className="text-sm font-medium text-gray-800">{label}</span>
                          </div>
                          {deps?.length ? (
                            <span className="text-xs text-gray-500 pr-7">
                              يتطلب: {deps.map((d) => labelByCode[d] ?? d).join('، ')}
                            </span>
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {selectedPerms.includes('FINGERPRINT_OFFICER') && (
                <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
                  <p className="text-sm font-medium text-amber-800 mb-2">الأقسام المسؤول عنها (إلزامي لموظف البصمة)</p>
                  <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                    {departments.map((d) => (
                      <label
                        key={d.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-amber-100 hover:border-amber-200 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDeptIds.includes(d.id)}
                          onChange={() =>
                            setSelectedDeptIds((prev) =>
                              prev.includes(d.id)
                                ? prev.filter((id) => id !== d.id)
                                : [...prev, d.id]
                            )
                          }
                          className="h-4 w-4 rounded border-2 border-gray-300 text-primary-500"
                        />
                        <span className="text-sm">{d.name}</span>
                      </label>
                    ))}
                  </div>
                  {selectedDeptIds.length === 0 && (
                    <p className="text-xs text-amber-600 mt-2">يجب اختيار قسم واحد على الأقل لموظف البصمة</p>
                  )}
                </div>
              )}
            </div>

            {/* تذييل ثابت: ملخص + أزرار */}
            <div className="pt-4 border-t border-gray-100 bg-gray-50/80 rounded-b-2xl -mx-6 -mb-6 px-6 pb-6">
              <p className="text-xs text-gray-500 mb-4">
                <span className="font-medium text-primary-600">المختار: {selectedPerms.length} صلاحية</span>
                {' — '}
                المستخدم بدون صلاحيات لا يرى إلا لوحة التحكم (Deny by Default).
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() =>
                    updateMutation.mutate({
                      id: selectedUser.id,
                      permissions: selectedPerms,
                      departmentIds: selectedPerms.includes('FINGERPRINT_OFFICER')
                        ? selectedDeptIds
                        : undefined,
                    })
                  }
                  disabled={
                    updateMutation.isPending ||
                    (selectedPerms.includes('FINGERPRINT_OFFICER') && selectedDeptIds.length === 0)
                  }
                >
                  {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
                </Button>
                <Button variant="secondary" onClick={() => setEditOpen(false)}>
                  إلغاء
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
