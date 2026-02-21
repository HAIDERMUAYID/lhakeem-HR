'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarDays, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { CanDo } from '@/components/shared/can-do';
import { useHasPermission } from '@/hooks/use-permissions';

type Holiday = {
  id: string;
  name: string;
  nameAr: string;
  date: string;
  appliesTo: string;
};

export default function HolidaysPage() {
  const canManageHolidays = useHasPermission(['HOLIDAYS_MANAGE']);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [holidayToDelete, setHolidayToDelete] = useState<Holiday | null>(null);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState({ name: '', nameAr: '', date: '' });
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; nameAr?: string; date?: string } }) =>
      apiPut(`/api/holidays/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setEditOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/holidays/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setDeleteOpen(false);
      setHolidayToDelete(null);
      toast.success('تم حذف العطلة بنجاح');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addMutation = useMutation({
    mutationFn: (body: { name: string; nameAr: string; date: string }) =>
      apiPost('/api/holidays', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setAddOpen(false);
      setForm({ name: '', nameAr: '', date: '' });
      toast.success('تمت إضافة العطلة بنجاح');
    },
  });

  const { data: holidays, isLoading, error } = useQuery({
    queryKey: ['holidays'],
    queryFn: () => apiGet<Holiday[]>('/api/holidays'),
  });

  const list = holidays ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">العطل الرسمية</h1>
          <p className="text-gray-500 mt-1">إدارة العطل والاستراحات</p>
        </div>
        <CanDo permission={['HOLIDAYS_MANAGE']}>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-5 w-5" />
            إضافة عطلة
          </Button>
        </CanDo>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة عطلة">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate(form);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم (إنجليزي)</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Eid"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم (عربي)</label>
            <Input
              value={form.nameAr}
              onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))}
              placeholder="العيد"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => { setEditOpen(false); setEditing(null); }} title="تعديل عطلة">
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate({ id: editing.id, body: form });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم (عربي)</label>
              <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
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
            <div className="py-16 text-center text-gray-500">حدث خطأ في تحميل البيانات</div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="لا توجد عطل مسجلة"
              description="أضف العطل الرسمية لاحتسابها في الإجازات والغيابات"
              actionLabel={canManageHolidays ? 'إضافة عطلة' : undefined}
              actionIcon={Plus}
              onAction={canManageHolidays ? () => setAddOpen(true) : undefined}
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {list.map((h, i) => (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center justify-between p-4 hover:bg-gray-50/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary-100 flex items-center justify-center">
                      <CalendarDays className="h-6 w-6 text-primary-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{h.nameAr}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(h.date).toLocaleDateString('ar-EG', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      {h.appliesTo === 'ALL' ? 'الكل' : h.appliesTo === 'MORNING_ONLY' ? 'صباحي فقط' : 'مخصص'}
                    </span>
                    <CanDo permission="HOLIDAYS_MANAGE">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(h); setForm({ name: h.name, nameAr: h.nameAr, date: h.date.slice(0, 10) }); setEditOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </CanDo>
                    <CanDo permission="HOLIDAYS_MANAGE">
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => { setHolidayToDelete(h); setDeleteOpen(true); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CanDo>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف العطلة"
        description={holidayToDelete ? `هل أنت متأكد من حذف عطلة "${holidayToDelete.nameAr}"؟` : undefined}
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={async () => { if (holidayToDelete) await deleteMutation.mutateAsync(holidayToDelete.id); }}
      />
    </motion.div>
  );
}
