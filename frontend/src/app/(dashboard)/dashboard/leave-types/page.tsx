'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Plus, Pencil } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/shared/empty-state';

type LeaveType = {
  id: string;
  name: string;
  nameAr: string;
  deductFromBalance: boolean;
  requiresApproval: boolean;
  annualAllowance: number | null;
  monthlyAccrual: number | string | null;
};

export default function LeaveTypesPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [form, setForm] = useState({
    name: '',
    nameAr: '',
    deductFromBalance: true,
    requiresApproval: true,
    annualAllowance: '' as string | number,
    monthlyAccrual: '' as string | number,
  });
  /** قيم محلية للحقول الرقمية — لكتابة سلسة على الجوال */
  const [localAnnualAllowance, setLocalAnnualAllowance] = useState('');
  const [localMonthlyAccrual, setLocalMonthlyAccrual] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (addOpen || editOpen) {
      setLocalAnnualAllowance(String(form.annualAllowance ?? ''));
      setLocalMonthlyAccrual(String(form.monthlyAccrual ?? ''));
    }
  }, [addOpen, editOpen, form.annualAllowance, form.monthlyAccrual]);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        const p = JSON.parse(u)?.permissions ?? [];
        setCanManage(p.includes('ADMIN') || p.includes('LEAVE_TYPES_MANAGE'));
      } catch {
        setCanManage(false);
      }
    }
  }, []);

  const { data: types = [], isLoading, error } = useQuery({
    queryKey: ['leave-types-all'],
    queryFn: () => apiGet<LeaveType[]>('/api/leave-types'),
  });

  const addMutation = useMutation({
    mutationFn: (body: typeof form) =>
      apiPost('/api/leave-types', {
        name: body.name,
        nameAr: body.nameAr,
        deductFromBalance: body.deductFromBalance,
        requiresApproval: body.requiresApproval,
        annualAllowance: body.annualAllowance ? Number(body.annualAllowance) : undefined,
        monthlyAccrual: body.monthlyAccrual ? Number(body.monthlyAccrual) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-types-all'] });
      setAddOpen(false);
      setForm({ name: '', nameAr: '', deductFromBalance: true, requiresApproval: true, annualAllowance: '', monthlyAccrual: '' });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<typeof form> }) =>
      apiPut(`/api/leave-types/${id}`, {
        name: body.name,
        nameAr: body.nameAr,
        deductFromBalance: body.deductFromBalance,
        requiresApproval: body.requiresApproval,
        annualAllowance: body.annualAllowance ? Number(body.annualAllowance) : null,
        monthlyAccrual: body.monthlyAccrual ? Number(body.monthlyAccrual) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-types-all'] });
      setEditOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (t: LeaveType) => {
    setEditing(t);
    setForm({
      name: t.name,
      nameAr: t.nameAr,
      deductFromBalance: t.deductFromBalance,
      requiresApproval: t.requiresApproval,
      annualAllowance: t.annualAllowance ?? '',
      monthlyAccrual: t.monthlyAccrual ?? '',
    });
    setEditOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">أنواع الإجازات</h1>
          <p className="text-gray-500 mt-1">إدارة أنواع الإجازات وإعداداتها</p>
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-5 w-5" />
            إضافة نوع
          </Button>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة نوع إجازة">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate({
              ...form,
              annualAllowance: localAnnualAllowance,
              monthlyAccrual: localMonthlyAccrual,
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم (إنجليزي)</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم (عربي)</label>
            <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} required />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.deductFromBalance} onChange={(e) => setForm((f) => ({ ...f, deductFromBalance: e.target.checked }))} />
              <span className="text-sm">استقطاع من الرصيد</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.requiresApproval} onChange={(e) => setForm((f) => ({ ...f, requiresApproval: e.target.checked }))} />
              <span className="text-sm">يتطلب موافقة</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الرصيد السنوي</label>
              <Input
                inputMode="decimal"
                type="text"
                value={localAnnualAllowance}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                  setLocalAnnualAllowance(v);
                }}
                onBlur={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                  setForm((f) => ({ ...f, annualAllowance: v === '' ? '' : v }));
                }}
                placeholder="—"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">التراكم الشهري</label>
              <Input
                inputMode="decimal"
                type="text"
                value={localMonthlyAccrual}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                  setLocalMonthlyAccrual(v);
                }}
                onBlur={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                  setForm((f) => ({ ...f, monthlyAccrual: v === '' ? '' : v }));
                }}
                placeholder="—"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={addMutation.isPending}>{addMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}</Button>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="تعديل نوع إجازة">
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate({
                id: editing.id,
                body: { ...form, annualAllowance: localAnnualAllowance, monthlyAccrual: localMonthlyAccrual },
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم (إنجليزي)</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم (عربي)</label>
              <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} required />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.deductFromBalance} onChange={(e) => setForm((f) => ({ ...f, deductFromBalance: e.target.checked }))} />
                <span className="text-sm">استقطاع من الرصيد</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.requiresApproval} onChange={(e) => setForm((f) => ({ ...f, requiresApproval: e.target.checked }))} />
                <span className="text-sm">يتطلب موافقة</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الرصيد السنوي</label>
                <Input
                  inputMode="decimal"
                  type="text"
                  value={localAnnualAllowance}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                    setLocalAnnualAllowance(v);
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                    setForm((f) => ({ ...f, annualAllowance: v === '' ? '' : v }));
                  }}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">التراكم الشهري</label>
                <Input
                  inputMode="decimal"
                  type="text"
                  value={localMonthlyAccrual}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                    setLocalMonthlyAccrual(v);
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                    setForm((f) => ({ ...f, monthlyAccrual: v === '' ? '' : v }));
                  }}
                  placeholder="—"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}</Button>
              <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>إلغاء</Button>
            </div>
          </form>
        )}
      </Modal>

      <Card className="overflow-hidden border-0 shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-16 text-center text-gray-500">حدث خطأ</div>
          ) : types.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="لا توجد أنواع إجازات"
              description="أضف أنواع الإجازات (اعتيادية، مرضية، إلخ) لاستخدامها في الطلبات"
              actionLabel="إضافة نوع إجازة"
              actionIcon={Plus}
              onAction={() => setAddOpen(true)}
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {types.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center justify-between p-4 hover:bg-gray-50/50"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{t.nameAr}</p>
                    <p className="text-sm text-gray-500">
                      {t.deductFromBalance ? 'يُستقطع من الرصيد' : 'لا يُستقطع'} •{' '}
                      {t.requiresApproval ? 'يتطلب موافقة' : 'بدون موافقة'}
                      {t.annualAllowance != null && ` • رصيد سنوي: ${t.annualAllowance}`}
                      {t.monthlyAccrual != null && ` • تراكم شهري: ${t.monthlyAccrual}`}
                    </p>
                  </div>
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => openEdit(t)} className="min-h-[44px]">
                      <Pencil className="h-4 w-4 ml-1" />
                      تعديل
                    </Button>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
