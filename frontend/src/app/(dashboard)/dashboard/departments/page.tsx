'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Users,
  Plus,
  Pencil,
  Search,
  UserCheck,
  Filter,
  UserCircle,
  UserPlus,
  ArrowRightLeft,
} from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/shared/empty-state';
import { CanDo } from '@/components/shared/can-do';
import { useHasPermission } from '@/hooks/use-permissions';

type Department = {
  id: string;
  name: string;
  code: string | null;
  isActive?: boolean;
  managerUser?: { id: string; name: string } | null;
  _count: { employees: number };
};

type DepartmentDetail = Department & {
  employees: {
    id: string;
    fullName: string;
    jobTitle: string;
    isActive: boolean;
    department: { id: string; name: string };
  }[];
};

type StatsResponse = {
  total: number;
  active: number;
  inactive: number;
  withManager: number;
  totalEmployees: number;
};

const KPI_CARDS = [
  { key: 'total', label: 'إجمالي الأقسام', icon: Building2, iconColor: 'text-slate-600', iconBg: 'bg-slate-100' },
  { key: 'active', label: 'النشطة', icon: UserCheck, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100' },
  { key: 'withManager', label: 'لها مسؤول', icon: UserCircle, iconColor: 'text-sky-600', iconBg: 'bg-sky-100' },
  { key: 'totalEmployees', label: 'إجمالي الموظفين', icon: Users, iconColor: 'text-violet-600', iconBg: 'bg-violet-100' },
];

export default function DepartmentsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [showInactive, setShowInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [employeesOpen, setEmployeesOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ name: '', code: '', managerUserId: '' as string });
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    isActive: true,
    managerUserId: '' as string,
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [addToDeptOpen, setAddToDeptOpen] = useState(false);
  const [selectedEmployeesForMove, setSelectedEmployeesForMove] = useState<Set<string>>(new Set());
  const [addToDeptSearch, setAddToDeptSearch] = useState('');
  const [moveSingleOpen, setMoveSingleOpen] = useState(false);
  const [moveSingleEmployee, setMoveSingleEmployee] = useState<{
    id: string;
    fullName: string;
    currentDeptId: string;
  } | null>(null);
  const [moveTargetDeptId, setMoveTargetDeptId] = useState('');
  const [employeesModalSearch, setEmployeesModalSearch] = useState('');
  const queryClient = useQueryClient();

  const canManageDepts = useHasPermission('DEPARTMENTS_MANAGE');

  const { data: users } = useQuery({
    queryKey: ['users-options'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/users/options'),
  });

  const { data: stats } = useQuery({
    queryKey: ['departments-stats'],
    queryFn: () => apiGet<StatsResponse>('/api/departments/stats'),
  });

  const { data: departments, isLoading, error } = useQuery({
    queryKey: ['departments', debouncedSearch, showInactive],
    queryFn: () =>
      apiGet<Department[]>(
        `/api/departments?${debouncedSearch ? `search=${encodeURIComponent(debouncedSearch)}` : ''}&activeOnly=${!showInactive}`
      ),
  });

  const { data: deptDetail } = useQuery({
    queryKey: ['department', selectedDeptId],
    queryFn: () => apiGet<DepartmentDetail>(`/api/departments/${selectedDeptId}`),
    enabled: !!selectedDeptId && employeesOpen,
  });

  const { data: employeesForMoveData } = useQuery({
    queryKey: ['employees-list', addToDeptSearch],
    queryFn: () =>
      apiGet<{ data: { id: string; fullName: string; jobTitle: string; department?: { id: string; name: string } }[]; total: number }>(
        `/api/employees?limit=100&${addToDeptSearch ? `search=${encodeURIComponent(addToDeptSearch)}` : ''}`
      ),
    enabled: addToDeptOpen,
  });

  const addMutation = useMutation({
    mutationFn: (body: { name: string; code?: string; managerUserId?: string | null }) =>
      apiPost('/api/departments', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['departments-stats'] });
      setAddOpen(false);
      setAddForm({ name: '', code: '', managerUserId: '' });
      toast.success('تمت إضافة القسم بنجاح');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name?: string; code?: string; isActive?: boolean; managerUserId?: string | null };
    }) => apiPut(`/api/departments/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['departments-stats'] });
      setEditOpen(false);
      setEditing(null);
      toast.success('تم تحديث القسم بنجاح');
    },
  });

  const moveEmployeeMutation = useMutation({
    mutationFn: ({ employeeId, departmentId }: { employeeId: string; departmentId: string }) =>
      apiPut(`/api/employees/${employeeId}`, { departmentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['department', selectedDeptId] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['departments-stats'] });
      setMoveSingleOpen(false);
      setMoveSingleEmployee(null);
      setMoveTargetDeptId('');
      toast.success('تم نقل الموظف إلى القسم الجديد');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = departments ?? [];
  const statsData = stats ?? { total: 0, active: 0, inactive: 0, withManager: 0, totalEmployees: 0 };
  const userOptions = (Array.isArray(users) ? users : []).map((u) => ({ value: u.id, label: u.name }));

  const filteredDeptEmployees = useMemo(() => {
    const employees = deptDetail?.employees ?? [];
    const q = employeesModalSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (emp) =>
        emp.fullName.toLowerCase().includes(q) ||
        (emp.jobTitle ?? '').toLowerCase().includes(q)
    );
  }, [deptDetail?.employees, employeesModalSearch]);

  const openEmployees = (dept: Department) => {
    setSelectedDeptId(dept.id);
    setEmployeesOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setEditForm({
      name: dept.name,
      code: dept.code ?? '',
      isActive: dept.isActive !== false,
      managerUserId: dept.managerUser?.id ?? '',
    });
    setEditOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">الأقسام</h1>
          <p className="text-gray-500 mt-1">إدارة أقسام المستشفى والوحدات والمسؤولين</p>
        </div>
        <CanDo permission="DEPARTMENTS_MANAGE">
          <Button onClick={() => setAddOpen(true)} className="gap-2 shadow-md">
            <Plus className="h-5 w-5" />
            إضافة قسم
          </Button>
        </CanDo>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Filters & Table */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className="border-b border-gray-100 bg-gradient-to-l from-gray-50 to-white p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="بحث بالاسم أو الكود..."
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
                عرض غير النشطة
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
                <Building2 className="h-7 w-7 text-red-500" />
              </div>
              <p className="text-gray-600 font-medium">حدث خطأ في تحميل البيانات</p>
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="لا يوجد أقسام"
              description="أضف أقساماً لتنظيم الموظفين والإدارات"
              actionLabel={canManageDepts ? 'إضافة أول قسم' : undefined}
              actionIcon={Plus}
              onAction={canManageDepts ? () => setAddOpen(true) : undefined}
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-6">
              {list.map((dept, i) => (
                <motion.div
                  key={dept.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card
                    className={`overflow-hidden border-0 shadow-md hover:shadow-lg transition-all ${
                      dept.isActive === false ? 'opacity-75' : ''
                    }`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                            <Building2 className="h-6 w-6 text-white" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate">{dept.name}</h3>
                            {dept.code && (
                              <p className="text-sm text-gray-500">{dept.code}</p>
                            )}
                            {dept.managerUser ? (
                              <p className="text-xs text-primary-600 mt-0.5 flex items-center gap-1">
                                <UserCircle className="h-3.5 w-3.5" />
                                {dept.managerUser.name}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-400 mt-0.5">بدون مسؤول</p>
                            )}
                          </div>
                        </div>
                        {dept.isActive === false && (
                          <Badge variant="default" className="shrink-0">غير نشط</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEmployees(dept)}
                          className="gap-1.5"
                        >
                          <Users className="h-4 w-4" />
                          {dept._count.employees} موظف
                        </Button>
                        <CanDo permission="DEPARTMENTS_MANAGE">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(dept)}
                            className="gap-1.5 text-gray-600 hover:text-primary-700"
                          >
                            <Pencil className="h-4 w-4" />
                            تعديل
                          </Button>
                        </CanDo>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة قسم جديد" className="max-w-lg">
        <div className="mb-4 p-4 rounded-xl bg-primary-50/50 border border-primary-100">
          <p className="text-sm text-primary-800">
            أدخل بيانات القسم. يمكنك اختيار مسؤول القسم من مستخدمي النظام.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate({
              name: addForm.name,
              code: addForm.code || undefined,
              managerUserId: addForm.managerUserId || null,
            });
          }}
          className="space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم القسم</label>
            <Input
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="مثال: الطب الباطني"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">كود القسم (اختياري)</label>
            <Input
              value={addForm.code}
              onChange={(e) => setAddForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="مثال: MED"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">مسؤول القسم</label>
            <Select
              value={addForm.managerUserId}
              onChange={(v) => setAddForm((f) => ({ ...f, managerUserId: v }))}
              options={userOptions}
              placeholder="اختر مستخدم (اختياري)"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? 'جاري الإضافة...' : 'إضافة القسم'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        title="تعديل قسم"
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
                  isActive: editForm.isActive,
                  managerUserId: editForm.managerUserId || null,
                },
              });
            }}
            className="space-y-5"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">اسم القسم</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">كود القسم (اختياري)</label>
              <Input
                value={editForm.code}
                onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="مثال: MED"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">مسؤول القسم</label>
              <Select
                value={editForm.managerUserId}
                onChange={(v) => setEditForm((f) => ({ ...f, managerUserId: v }))}
                options={userOptions}
                placeholder="اختر مستخدم (اختياري)"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.isActive}
                onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              قسم نشط
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

      {/* Employees Modal */}
      <Modal
        open={employeesOpen}
        onClose={() => {
          setEmployeesOpen(false);
          setSelectedDeptId(null);
          setEmployeesModalSearch('');
        }}
        title={deptDetail ? `موظفو قسم ${deptDetail.name}` : 'موظفو القسم'}
        className="max-w-2xl max-h-[85vh] flex flex-col"
      >
        {deptDetail && (deptDetail.employees?.length ?? 0) > 0 && (
          <div className="relative mb-4">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              placeholder="بحث بالاسم أو الوظيفة..."
              value={employeesModalSearch}
              onChange={(e) => setEmployeesModalSearch(e.target.value)}
              className="pr-10 pl-4 bg-white border-gray-200"
            />
          </div>
        )}
        <div className="flex-1 overflow-auto min-h-0">
          {deptDetail?.employees?.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">لا يوجد موظفين في هذا القسم</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDeptEmployees.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  لا توجد نتائج لـ &quot;{employeesModalSearch}&quot;
                </div>
              ) : (
                filteredDeptEmployees.map((emp) => (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{emp.fullName}</p>
                      <p className="text-sm text-gray-500">{emp.jobTitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {emp.isActive ? (
                        <Badge variant="success">نشط</Badge>
                      ) : (
                        <Badge variant="default">متوقف</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          setMoveSingleEmployee({
                            id: emp.id,
                            fullName: emp.fullName,
                            currentDeptId: emp.department?.id ?? '',
                          });
                          setMoveTargetDeptId('');
                          setMoveSingleOpen(true);
                        }}
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                        نقل
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <div className="flex justify-between gap-2 pt-4 border-t border-gray-100 mt-4">
          <div className="flex gap-2">
            {selectedDeptId && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setAddToDeptOpen(true);
                    setSelectedEmployeesForMove(new Set());
                    setAddToDeptSearch('');
                  }}
                >
                  <UserPlus className="h-4 w-4" />
                  نقل موظفين إلى هذا القسم
                </Button>
                <Link href={`/dashboard/employees?departmentId=${selectedDeptId}`}>
                  <Button variant="outline" size="sm">
                    عرض في صفحة الموظفين
                  </Button>
                </Link>
              </>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setEmployeesOpen(false);
              setSelectedDeptId(null);
            }}
          >
            إغلاق
          </Button>
        </div>
      </Modal>

      {/* Add employees to department (move to this department) */}
      <Modal
        open={addToDeptOpen}
        onClose={() => {
          setAddToDeptOpen(false);
          setSelectedEmployeesForMove(new Set());
        }}
        title={deptDetail ? `نقل موظفين إلى قسم ${deptDetail.name}` : 'نقل موظفين'}
        className="max-w-2xl max-h-[85vh] flex flex-col"
      >
        <p className="text-sm text-gray-600 mb-4">
          كل موظف يكون في قسم واحد فقط. سيتم نقل الموظفين المختارين إلى هذا القسم (وإزالتهم من قسمهم الحالي إن وُجد).
        </p>
        <div className="mb-4">
          <Input
            placeholder="بحث بالاسم..."
            value={addToDeptSearch}
            onChange={(e) => setAddToDeptSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="flex-1 overflow-auto min-h-0 border rounded-xl border-gray-200 max-h-80">
          {(employeesForMoveData?.data ?? [])
            .filter((e) => !deptDetail?.employees?.some((emp) => emp.id === e.id))
            .map((emp) => (
              <label
                key={emp.id}
                className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
              >
                <input
                  type="checkbox"
                  checked={selectedEmployeesForMove.has(emp.id)}
                  onChange={() => {
                    setSelectedEmployeesForMove((prev) => {
                      const next = new Set(prev);
                      if (next.has(emp.id)) next.delete(emp.id);
                      else next.add(emp.id);
                      return next;
                    });
                  }}
                  className="rounded border-gray-300 text-primary-600"
                />
                <span className="font-medium text-gray-900">{emp.fullName}</span>
                <span className="text-sm text-gray-500">{emp.jobTitle}</span>
                {emp.department && (
                  <span className="text-xs text-amber-600">حالياً: {emp.department.name}</span>
                )}
              </label>
            ))}
        </div>
        {((employeesForMoveData?.data ?? []).filter((e) => !deptDetail?.employees?.some((emp) => emp.id === e.id)).length === 0) && (
          <p className="text-gray-500 py-4">لا يوجد موظفين خارج هذا القسم، أو لا توجد نتائج بحث.</p>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setAddToDeptOpen(false)}>
            إلغاء
          </Button>
          <Button
            disabled={selectedEmployeesForMove.size === 0}
            onClick={async () => {
              if (!selectedDeptId || selectedEmployeesForMove.size === 0) return;
              if (typeof window !== 'undefined' && !window.confirm(
                `نقل ${selectedEmployeesForMove.size} موظف إلى قسم ${deptDetail?.name}؟ الموظفون الموجودون في أقسام أخرى سيُنقلون لهذا القسم.`
              )) return;
              for (const empId of Array.from(selectedEmployeesForMove)) {
                await apiPut(`/api/employees/${empId}`, { departmentId: selectedDeptId });
              }
              queryClient.invalidateQueries({ queryKey: ['department', selectedDeptId] });
              queryClient.invalidateQueries({ queryKey: ['departments'] });
              queryClient.invalidateQueries({ queryKey: ['departments-stats'] });
              toast.success('تم نقل الموظفين إلى القسم');
              setAddToDeptOpen(false);
              setSelectedEmployeesForMove(new Set());
            }}
          >
            نقل إلى هذا القسم
          </Button>
        </div>
      </Modal>

      {/* Move single employee to another department */}
      <Modal
        open={moveSingleOpen}
        onClose={() => {
          setMoveSingleOpen(false);
          setMoveSingleEmployee(null);
          setMoveTargetDeptId('');
        }}
        title={moveSingleEmployee ? `نقل ${moveSingleEmployee.fullName} إلى قسم آخر` : 'نقل موظف'}
        className="max-w-md"
      >
        {moveSingleEmployee && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              اختر القسم الهدف. الموظف سيكون في قسم واحد فقط.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">القسم الهدف</label>
              <Select
                value={moveTargetDeptId}
                onChange={(v) => setMoveTargetDeptId(v)}
                options={list
                  .filter((d) => d.id !== moveSingleEmployee.currentDeptId)
                  .map((d) => ({ value: d.id, label: d.name }))}
                placeholder="اختر القسم"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMoveSingleOpen(false)}>
                إلغاء
              </Button>
              <Button
                disabled={!moveTargetDeptId}
                onClick={() =>
                  moveEmployeeMutation.mutate({
                    employeeId: moveSingleEmployee.id,
                    departmentId: moveTargetDeptId,
                  })
                }
              >
                نقل
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
