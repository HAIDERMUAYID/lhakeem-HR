'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  Layers3,
  Plus,
  Pencil,
  Users,
  UserCircle,
  LayoutGrid,
  List,
} from 'lucide-react';

import { apiGet } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { MoveEmployeesModal } from '@/components/departments/move-employees-modal';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { apiPatch, apiPost, apiDelete } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type Unit = {
  id: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  managerUser?: { id: string; name: string } | null;
  _count?: { employees: number };
};

type Employee = {
  id: string;
  fullName: string;
  jobTitle: string;
  isActive: boolean;
  unit?: { id: string; name: string } | null;
};

type DepartmentDetail = {
  id: string;
  name: string;
  code: string | null;
  description?: string | null;
  isActive?: boolean;
  managerUser?: { id: string; name: string } | null;
  units: Unit[];
  employees: Employee[];
};

export default function DepartmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const deptId = params?.id;

  const [tab, setTab] = useState<'units' | 'employees'>('units');
  const [search, setSearch] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Record<string, true>>({});
  const [unitAddOpen, setUnitAddOpen] = useState(false);
  const [unitEditOpen, setUnitEditOpen] = useState(false);
  const [unitEditing, setUnitEditing] = useState<Unit | null>(null);
  const [unitForm, setUnitForm] = useState({
    name: '',
    code: '',
    managerUserId: '',
    sortOrder: '0',
    description: '',
  });
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['department-detail', deptId],
    queryFn: () => apiGet<DepartmentDetail>(`/api/departments/${deptId}`),
    enabled: !!deptId,
  });

  const units = data?.units ?? [];
  const employees = data?.employees ?? [];

  const { data: users } = useQuery({
    queryKey: ['users-options'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/users/options'),
    enabled: !!deptId,
  });
  const userOptions = (Array.isArray(users) ? users : []).map((u) => ({ value: u.id, label: u.name }));

  const employeesWithoutUnit = useMemo(() => employees.filter((e) => !e.unit?.id), [employees]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        (e.jobTitle ?? '').toLowerCase().includes(q) ||
        (e.unit?.name ?? '').toLowerCase().includes(q),
    );
  }, [employees, search]);

  const selectedIds = useMemo(() => Object.keys(selectedEmployeeIds), [selectedEmployeeIds]);
  const toggleAllFiltered = (checked: boolean) => {
    if (!checked) {
      setSelectedEmployeeIds({});
      return;
    }
    const next: Record<string, true> = {};
    for (const e of filteredEmployees) next[e.id] = true;
    setSelectedEmployeeIds(next);
  };

  const createUnitMutation = useMutation({
    mutationFn: (body: { departmentId: string; name: string; code?: string | null; managerUserId?: string | null; sortOrder?: number; description?: string | null }) =>
      apiPost('/api/units', body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['department-detail', deptId] });
      setUnitAddOpen(false);
      setUnitForm({ name: '', code: '', managerUserId: '', sortOrder: '0', description: '' });
    },
  });

  const updateUnitMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { name?: string; code?: string | null; managerUserId?: string | null; sortOrder?: number; description?: string | null; isActive?: boolean } }) =>
      apiPatch(`/api/units/${id}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['department-detail', deptId] });
      setUnitEditOpen(false);
      setUnitEditing(null);
    },
  });

  const deleteUnitMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/units/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['department-detail', deptId] });
      setUnitEditOpen(false);
      setUnitEditing(null);
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Breadcrumb + Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/dashboard/departments" className="hover:text-gray-800 transition-colors">
              الأقسام
            </Link>
            <ChevronLeft className="h-4 w-4" />
            <span className="text-gray-900 font-semibold truncate max-w-[60vw]">{data?.name ?? 'تفاصيل القسم'}</span>
          </div>
          <Button variant="outline" onClick={() => router.back()} className="gap-2">
            <ArrowRight className="h-4 w-4" />
            رجوع
          </Button>
        </div>

        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-5 bg-gradient-to-l from-gray-50 to-white">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{data?.name ?? '—'}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {data?.code && <Badge variant="secondary">{data.code}</Badge>}
                    {data?.isActive === false && <Badge variant="default">غير نشط</Badge>}
                    {data?.managerUser ? (
                      <span className="text-sm text-primary-700 inline-flex items-center gap-1">
                        <UserCircle className="h-4 w-4" />
                        {data.managerUser.name}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">بدون مسؤول</span>
                    )}
                  </div>
                  {data?.description && <p className="text-sm text-gray-600 mt-2 max-w-2xl">{data.description}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:min-w-[220px]">
                <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{units.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">وحدات</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{employees.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">موظفين</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-2 rounded-xl bg-slate-50/80">
        <button
          type="button"
          onClick={() => setTab('units')}
          className={cn(
            'flex-1 min-h-[44px] rounded-lg border-2 border-transparent px-3 py-2.5 transition-all inline-flex items-center justify-center gap-2 text-sm font-medium',
            tab === 'units' ? 'border-primary-500 bg-white shadow-sm text-primary-700' : 'text-gray-600 hover:text-gray-900',
          )}
        >
          <LayoutGrid className="h-4 w-4" />
          الوحدات
        </button>
        <button
          type="button"
          onClick={() => setTab('employees')}
          className={cn(
            'flex-1 min-h-[44px] rounded-lg border-2 border-transparent px-3 py-2.5 transition-all inline-flex items-center justify-center gap-2 text-sm font-medium',
            tab === 'employees' ? 'border-primary-500 bg-white shadow-sm text-primary-700' : 'text-gray-600 hover:text-gray-900',
          )}
        >
          <List className="h-4 w-4" />
          الموظفون
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : error || !data ? (
        <EmptyState icon={Building2} title="تعذر تحميل تفاصيل القسم" description="حاول مرة أخرى" compact />
      ) : tab === 'units' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Without unit */}
          <Card className="border-0 shadow-md overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-200 to-slate-100 flex items-center justify-center shrink-0">
                    <Users className="h-6 w-6 text-slate-700" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">بدون وحدة</h3>
                    <p className="text-sm text-gray-500">موظفو القسم غير المعيّنين لوحدة</p>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {employeesWithoutUnit.length} موظف
                </Badge>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                <Button
                  variant="outline"
                  className="gap-2 min-h-[44px]"
                  onClick={() => setTab('employees')}
                >
                  <Layers3 className="h-4 w-4" />
                  عرض الموظفين
                </Button>
              </div>
            </CardContent>
          </Card>

          {units.map((u) => (
            <Card
              key={u.id}
              className="border-0 shadow-md hover:shadow-lg transition-all overflow-hidden cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/dashboard/departments/${data.id}/units/${u.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                      <Layers3 className="h-6 w-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{u.name}</h3>
                      {u.code && <p className="text-sm text-gray-500">{u.code}</p>}
                      {u.managerUser ? (
                        <p className="text-xs text-primary-600 mt-0.5 flex items-center gap-1">
                          <UserCircle className="h-3.5 w-3.5" />
                          {u.managerUser.name}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">بدون مسؤول</p>
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {u._count?.employees ?? 0} موظف
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500">اضغط للدخول</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-gray-600 hover:text-primary-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUnitEditing(u);
                      setUnitForm({
                        name: u.name ?? '',
                        code: u.code ?? '',
                        managerUserId: u.managerUser?.id ?? '',
                        sortOrder: String(u.sortOrder ?? 0),
                        description: (u as any).description ?? '',
                      });
                      setUnitEditOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    إدارة
                  </Button>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">عرض تفاصيل الوحدة</span>
                  <ChevronLeft className="h-4 w-4 text-gray-400" />
                </div>
              </CardContent>
            </Card>
          ))}

          <Card className="border-2 border-dashed border-gray-200 bg-white/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">إضافة وحدة</p>
                  <p className="text-sm text-gray-500">أنشئ وحدة جديدة داخل هذا القسم</p>
                </div>
                <Button type="button" variant="outline" className="gap-2 min-h-[44px]" onClick={() => setUnitAddOpen(true)}>
                  <Plus className="h-4 w-4" />
                  إضافة
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="border-b border-gray-100 bg-gradient-to-l from-gray-50 to-white p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Input
                  placeholder="بحث بالاسم أو المسمى أو الوحدة..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-white border-gray-200"
                />
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {selectedIds.length > 0 && (
                  <Button className="gap-2" onClick={() => setMoveOpen(true)}>
                    نقل المحدد ({selectedIds.length})
                  </Button>
                )}
                <Badge variant="secondary">{filteredEmployees.length} موظف</Badge>
              </div>
            </div>
          </div>
          <CardContent className="p-0">
            {filteredEmployees.length === 0 ? (
              <EmptyState icon={Users} title="لا يوجد موظفون مطابقون" description="جرّب تغيير البحث" compact />
            ) : (
              <div className="p-4 sm:p-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[52px]">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedIds.length > 0 && selectedIds.length === filteredEmployees.length}
                          onChange={(e) => toggleAllFiltered(e.target.checked)}
                        />
                      </TableHead>
                      <TableHead>الموظف</TableHead>
                      <TableHead>المسمى</TableHead>
                      <TableHead>الوحدة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!!selectedEmployeeIds[e.id]}
                            onChange={(ev) =>
                              setSelectedEmployeeIds((prev) => {
                                const next = { ...prev };
                                if (ev.target.checked) next[e.id] = true;
                                else delete next[e.id];
                                return next;
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">{e.fullName}</TableCell>
                        <TableCell className="text-gray-600">{e.jobTitle}</TableCell>
                        <TableCell>
                          {e.unit?.name ? (
                            <Badge variant="secondary">{e.unit.name}</Badge>
                          ) : (
                            <span className="text-gray-400">بدون وحدة</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <MoveEmployeesModal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        employeeIds={selectedIds}
        defaultDepartmentId={data?.id}
        onMoved={() => setSelectedEmployeeIds({})}
      />

      <Modal open={unitAddOpen} onClose={() => setUnitAddOpen(false)} title="إضافة وحدة" className="max-w-lg">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!deptId) return;
            createUnitMutation.mutate({
              departmentId: String(deptId),
              name: unitForm.name,
              code: unitForm.code || null,
              managerUserId: unitForm.managerUserId || null,
              sortOrder: Number(unitForm.sortOrder) || 0,
              description: unitForm.description || null,
            });
          }}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم الوحدة</label>
            <Input value={unitForm.name} onChange={(e) => setUnitForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">كود (اختياري)</label>
            <Input value={unitForm.code} onChange={(e) => setUnitForm((f) => ({ ...f, code: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">مسؤول (اختياري)</label>
              <Select value={unitForm.managerUserId} onChange={(v) => setUnitForm((f) => ({ ...f, managerUserId: v }))} options={userOptions} placeholder="بدون مسؤول" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">الترتيب</label>
              <Input inputMode="numeric" value={unitForm.sortOrder} onChange={(e) => setUnitForm((f) => ({ ...f, sortOrder: e.target.value.replace(/\\D/g, '') }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">وصف (اختياري)</label>
            <Input value={unitForm.description} onChange={(e) => setUnitForm((f) => ({ ...f, description: e.target.value }))} />
          </div>

          {createUnitMutation.isError && (
            <p className="text-sm text-red-600">{(createUnitMutation.error as Error)?.message ?? 'حدث خطأ'}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setUnitAddOpen(false)} disabled={createUnitMutation.isPending}>
              إلغاء
            </Button>
            <Button type="submit" disabled={createUnitMutation.isPending} className="gap-2">
              <Plus className="h-4 w-4" />
              حفظ
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={unitEditOpen} onClose={() => setUnitEditOpen(false)} title="إدارة الوحدة" className="max-w-lg">
        {unitEditing ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              updateUnitMutation.mutate({
                id: unitEditing.id,
                body: {
                  name: unitForm.name,
                  code: unitForm.code || null,
                  managerUserId: unitForm.managerUserId || null,
                  sortOrder: Number(unitForm.sortOrder) || 0,
                  description: unitForm.description || null,
                },
              });
            }}
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم الوحدة</label>
              <Input value={unitForm.name} onChange={(e) => setUnitForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">كود (اختياري)</label>
                <Input value={unitForm.code} onChange={(e) => setUnitForm((f) => ({ ...f, code: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">الترتيب</label>
                <Input inputMode="numeric" value={unitForm.sortOrder} onChange={(e) => setUnitForm((f) => ({ ...f, sortOrder: e.target.value.replace(/\\D/g, '') }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">مسؤول (اختياري)</label>
              <Select value={unitForm.managerUserId} onChange={(v) => setUnitForm((f) => ({ ...f, managerUserId: v }))} options={userOptions} placeholder="بدون مسؤول" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">وصف (اختياري)</label>
              <Input value={unitForm.description} onChange={(e) => setUnitForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            {(updateUnitMutation.isError || deleteUnitMutation.isError) && (
              <p className="text-sm text-red-600">
                {((updateUnitMutation.error as Error) || (deleteUnitMutation.error as Error))?.message ?? 'حدث خطأ'}
              </p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                disabled={deleteUnitMutation.isPending}
                onClick={() => deleteUnitMutation.mutate(unitEditing.id)}
              >
                تعطيل الوحدة
              </Button>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setUnitEditOpen(false)} disabled={updateUnitMutation.isPending}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={updateUnitMutation.isPending} className="gap-2">
                  حفظ
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <EmptyState icon={Layers3} title="لا توجد وحدة محددة" compact />
        )}
      </Modal>
    </motion.div>
  );
}

