'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Fingerprint,
  Plus,
  Pencil,
  Search,
  Filter,
  MapPin,
  Trash2,
  CheckCircle,
  XCircle,
  Users,
} from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/shared/empty-state';

type Device = {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  isActive: boolean;
  _count: { fingerprints: number };
};

type StatsResponse = {
  total: number;
  active: number;
  inactive: number;
  withFingerprints: number;
};

const KPI_CARDS = [
  { key: 'total', label: 'إجمالي الأجهزة', icon: Fingerprint, iconColor: 'text-slate-600', iconBg: 'bg-slate-100' },
  { key: 'active', label: 'المفعّلة', icon: CheckCircle, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100' },
  { key: 'withFingerprints', label: 'مرتبطة ببصمات', icon: Fingerprint, iconColor: 'text-violet-600', iconBg: 'bg-violet-100' },
];

export default function DevicesPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [addForm, setAddForm] = useState({ name: '', code: '', location: '', isActive: true });
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    location: '',
    isActive: true,
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['devices-stats'],
    queryFn: () => apiGet<StatsResponse>('/api/devices/stats'),
  });

  const { data: devices, isLoading, error } = useQuery({
    queryKey: ['devices', debouncedSearch, showInactive],
    queryFn: () =>
      apiGet<Device[]>(
        `/api/devices?${debouncedSearch ? `search=${encodeURIComponent(debouncedSearch)}` : ''}&activeOnly=${!showInactive}`
      ),
  });

  const addMutation = useMutation({
    mutationFn: (body: { name: string; code?: string; location?: string; isActive?: boolean }) =>
      apiPost('/api/devices', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['devices-stats'] });
      setAddOpen(false);
      setAddForm({ name: '', code: '', location: '', isActive: true });
      toast.success('تمت إضافة الجهاز بنجاح');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name?: string; code?: string; location?: string; isActive?: boolean };
    }) => apiPut(`/api/devices/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['devices-stats'] });
      setEditOpen(false);
      setEditing(null);
      toast.success('تم تحديث الجهاز بنجاح');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/devices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['devices-stats'] });
      toast.success('تم حذف الجهاز');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = devices ?? [];
  const statsData = stats ?? { total: 0, active: 0, inactive: 0, withFingerprints: 0 };

  const openEdit = (d: Device) => {
    setEditing(d);
    setEditForm({
      name: d.name,
      code: d.code ?? '',
      location: d.location ?? '',
      isActive: d.isActive,
    });
    setEditOpen(true);
  };

  const handleDelete = (d: Device) => {
    if (d._count.fingerprints > 0) {
      toast.error('لا يمكن حذف الجهاز لأنه مرتبط ببصمات موظفين');
      return;
    }
    if (typeof window !== 'undefined' && !window.confirm('حذف هذا الجهاز؟')) return;
    deleteMutation.mutate(d.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">أجهزة البصمة</h1>
          <p className="text-gray-500 mt-1">إدارة أجهزة الحضور (الإدارة، الطوارئ، إلخ)</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 shadow-md">
          <Plus className="h-5 w-5" />
          إضافة جهاز
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {KPI_CARDS.map((card, i) => {
          const Icon = card.icon;
          const value = statsData[card.key as keyof StatsResponse] ?? 0;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="border-0 shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {card.label}
                      </p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                    </div>
                    <div className={`rounded-xl p-2.5 ${card.iconBg}`}>
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Card className="border-0 shadow-md overflow-hidden">
        <div className="border-b border-gray-100 bg-gradient-to-l from-gray-50 to-white p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="بحث بالاسم أو الكود أو الموقع..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-11 pl-4 bg-white border-gray-200"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setFiltersExpanded((f) => !f)}
              className="gap-2 shrink-0"
            >
              <Filter className="h-4 w-4" />
              الفلاتر
            </Button>
          </div>
          {filtersExpanded && (
            <div className="flex flex-wrap gap-4 p-4 mt-4 rounded-xl bg-white border border-gray-100">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                عرض غير المفعّلة
              </label>
            </div>
          )}
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-36 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="py-20 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50 mb-4">
                <Fingerprint className="h-7 w-7 text-red-500" />
              </div>
              <p className="text-gray-600 font-medium">حدث خطأ في تحميل البيانات</p>
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={Fingerprint}
              title="لا توجد أجهزة"
              description="أضف أجهزة بصمة لربطها بالموظفين لاحقاً"
              actionLabel="إضافة أول جهاز"
              actionIcon={Plus}
              onAction={() => setAddOpen(true)}
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-6">
              {list.map((d, i) => (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card
                    className={`overflow-hidden border-0 shadow-md hover:shadow-lg transition-all ${
                      !d.isActive ? 'opacity-75' : ''
                    }`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shrink-0">
                            <Fingerprint className="h-6 w-6 text-white" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">{d.name}</h3>
                            {d.code && <p className="text-sm text-gray-500">{d.code}</p>}
                            {d.location ? (
                              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {d.location}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {!d.isActive && (
                          <Badge variant="default" className="shrink-0">
                            <XCircle className="h-3 w-3 ml-1" />
                            معطّل
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                        <Link href={`/dashboard/devices/${d.id}`}>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <Users className="h-4 w-4" />
                            {d._count.fingerprints} بصمة
                          </Button>
                        </Link>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(d)}
                            className="gap-1.5 text-gray-600 hover:text-primary-700"
                          >
                            <Pencil className="h-4 w-4" />
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(d)}
                            disabled={d._count.fingerprints > 0}
                            className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة جهاز بصمة" className="max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate({
              name: addForm.name,
              code: addForm.code || undefined,
              location: addForm.location || undefined,
              isActive: addForm.isActive,
            });
          }}
          className="space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم الجهاز *</label>
            <Input
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="مثال: جهاز الإدارة"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الكود (اختياري)</label>
            <Input
              value={addForm.code}
              onChange={(e) => setAddForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="مثال: ADM-01"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الموقع (اختياري)</label>
            <Input
              value={addForm.location}
              onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="مثال: مبنى الإدارة"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.isActive}
              onChange={(e) => setAddForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            الجهاز مفعّل
          </label>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? 'جاري الإضافة...' : 'إضافة الجهاز'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        title="تعديل جهاز"
        className="max-w-lg"
      >
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate({
                id: editing.id,
                body: {
                  name: editForm.name,
                  code: editForm.code || undefined,
                  location: editForm.location || undefined,
                  isActive: editForm.isActive,
                },
              });
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم الجهاز *</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الكود (اختياري)</label>
              <Input
                value={editForm.code}
                onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="مثال: ADM-01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الموقع (اختياري)</label>
              <Input
                value={editForm.location}
                onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              الجهاز مفعّل
            </label>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditOpen(false);
                  setEditing(null);
                }}
              >
                إلغاء
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </motion.div>
  );
}
