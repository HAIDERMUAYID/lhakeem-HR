'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Users,
  Pencil,
  Upload,
  UserCheck,
  UserX,
  Sun,
  Moon,
  Building2,
  UserCircle,
  Briefcase,
  Filter,
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileDown,
  Fingerprint,
  Trash2,
} from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { TableSkeleton } from '@/components/shared/page-skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ResponsiveDataView } from '@/components/shared/responsive-data-view';
import { downloadCSV } from '@/lib/export';
import { motion } from 'framer-motion';

type EmployeeFingerprintRow = {
  id: string;
  fingerprintId: string;
  device: { id: string; name: string; code?: string | null };
};
type Employee = {
  id: string;
  fullName: string;
  jobTitle: string;
  leaveBalance: string | number;
  balanceStartDate?: string | null;
  workType: string;
  isActive: boolean;
  department: { id: string; name: string };
  manager?: { fullName: string } | null;
  managerUser?: { id: string; name: string } | null;
  updatedAt?: string;
  fingerprints?: EmployeeFingerprintRow[];
};

type EmployeesResponse = { data: Employee[]; total: number };

type StatsResponse = { total: number; active: number; inactive: number; morning: number; shifts: number };

const formDefaults = {
  fullName: '',
  jobTitle: '',
  departmentId: '',
  managerUserId: '' as string,
  workType: 'MORNING' as 'MORNING' | 'SHIFTS',
  /** يُخزَّن كنص لتفادي أخطاء الإدخال على الجوال (مثلاً 2 تُكتب 20) */
  leaveBalance: '' as string,
  balanceStartDate: '' as string,
  isActive: true,
};

/** نوع الحقول المرسلة للـ API (leaveBalance كرقم) */
type EmployeeFormBody = Omit<typeof formDefaults, 'managerUserId' | 'leaveBalance'> & {
  managerUserId: string | null;
  leaveBalance: number;
};

const PAGE_SIZES = [10, 25, 50] as const;

const KPI_CARDS = [
  { key: 'total', label: 'إجمالي الموظفين', icon: Users, iconColor: 'text-slate-600', iconBg: 'bg-slate-100' },
  { key: 'active', label: 'النشطين', icon: UserCheck, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100' },
  { key: 'inactive', label: 'المتوقفين', icon: UserX, iconColor: 'text-amber-600', iconBg: 'bg-amber-100' },
  { key: 'morning', label: 'دوام صباحي', icon: Sun, iconColor: 'text-sky-600', iconBg: 'bg-sky-100' },
  { key: 'shifts', label: 'دوام خفارات', icon: Moon, iconColor: 'text-violet-600', iconBg: 'bg-violet-100' },
];

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [workTypeFilter, setWorkTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState<'fullName' | 'jobTitle' | 'leaveBalance' | 'department' | 'updatedAt'>('fullName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [canImport, setCanImport] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(formDefaults);
  const [importDefaultDeptId, setImportDefaultDeptId] = useState('');
  const [importDragOver, setImportDragOver] = useState(false);
  const [pendingFingerprints, setPendingFingerprints] = useState<{ deviceId: string; fingerprintId: string }[]>([]);
  const [addFpDeviceId, setAddFpDeviceId] = useState('');
  const [addFpId, setAddFpId] = useState('');
  const [editFingerprints, setEditFingerprints] = useState<{ id?: string; deviceId: string; fingerprintId: string; device?: { id: string; name: string; code?: string | null } }[]>([]);
  const initialEditFingerprintIds = useRef<string[]>([]);
  const [editFpDeviceId, setEditFpDeviceId] = useState('');
  const [editFpId, setEditFpId] = useState('');
  /** ref لحقل الرصيد — حقل غير خاضع للتحكم (uncontrolled) لتفادي اختفاء المؤشر عند الكتابة على الجوال */
  const leaveBalanceInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  useEffect(() => {
    const deptId = searchParams.get('departmentId');
    const incomplete = searchParams.get('incompleteOnly');
    if (deptId) {
      setDepartmentFilter(deptId);
      setFiltersExpanded(true);
    }
    if (incomplete === 'true' || incomplete === '1') {
      setIncompleteOnly(true);
      setFiltersExpanded(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) {
      try {
        const p = JSON.parse(u)?.permissions ?? [];
        setCanImport(p.includes('ADMIN') || p.includes('EMPLOYEES_MANAGE'));
      } catch {
        setCanImport(false);
      }
    }
  }, []);

  const { data: depts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiGet<{ id: string; name: string; code?: string | null }[]>('/api/departments'),
  });

  const { data: users } = useQuery({
    queryKey: ['users-options'],
    queryFn: () => apiGet<{ id: string; name: string }[]>('/api/users/options'),
  });

  const { data: devicesList } = useQuery({
    queryKey: ['devices', 'active'],
    queryFn: () => apiGet<{ id: string; name: string; code?: string | null }[]>('/api/devices?activeOnly=true'),
  });

  const { data: stats } = useQuery({
    queryKey: ['employees-stats', departmentFilter],
    queryFn: () =>
      apiGet<StatsResponse>(`/api/employees/stats${departmentFilter ? `?departmentId=${departmentFilter}` : ''}`),
  });

  type AddEmployeePayload = { body: EmployeeFormBody; fingerprints: { deviceId: string; fingerprintId: string }[] };
  const addMutation = useMutation({
    mutationFn: async ({ body }: AddEmployeePayload) => apiPost<Employee>('/api/employees', body),
    onSuccess: async (created, variables) => {
      const employeeId = created?.id;
      const fingerprints = variables?.fingerprints ?? [];
      if (employeeId && fingerprints.length > 0) {
        for (const fp of fingerprints) {
          try {
            await apiPost(`/api/employees/${employeeId}/fingerprints`, {
              deviceId: fp.deviceId,
              fingerprintId: fp.fingerprintId,
            });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'فشل ربط أحد معرفات البصمة');
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-stats'] });
      setAddOpen(false);
      setForm(formDefaults);
      setPendingFingerprints([]);
      setAddFpDeviceId('');
      setAddFpId('');
      toast.success('تمت إضافة الموظف بنجاح');
    },
  });

  const importMutation = useMutation({
    mutationFn: (payload: {
      rows: { fullName: string; jobTitle?: string; departmentCode: string; workType?: string; leaveBalance?: number }[];
      fileName?: string;
    }) =>
      apiPost<{
        batchId: string;
        imported: number;
        failed: number;
        details: { fullName: string; ok: boolean; error?: string }[];
      }>('/api/employees/import', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-stats'] });
      setImportOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success(`تم استيراد ${res.imported} موظف. فشل: ${res.failed}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EmployeeFormBody }) =>
      apiPut(`/api/employees/${id}`, body),
    onSuccess: async () => {
      const empId = editingId;
      if (empId) {
        const toAdd = editFingerprints.filter((f) => !f.id);
        const currentIds = new Set(editFingerprints.filter((f) => f.id).map((f) => f.id!));
        const toRemove = initialEditFingerprintIds.current.filter((id) => !currentIds.has(id));
        for (const fp of toAdd) {
          try {
            await apiPost(`/api/employees/${empId}/fingerprints`, { deviceId: fp.deviceId, fingerprintId: fp.fingerprintId });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'فشل ربط أحد البصمات');
          }
        }
        for (const recordId of toRemove) {
          try {
            await apiDelete(`/api/employees/${empId}/fingerprints/${recordId}`);
          } catch {
            // ignore
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees-stats'] });
      setEditOpen(false);
      setEditingId(null);
      setEditFingerprints([]);
      toast.success('تم تحديث الموظف بنجاح');
    },
  });

  const toRow = (vals: (string | number)[], defaultDeptCode: string) => {
    const hasSequence = vals.length >= 3 && /^\d+$/.test(String(vals[0] ?? '').trim());
    const nameIdx = hasSequence ? 1 : 0;
    const titleIdx = hasSequence ? 2 : 1;
    const deptIdx = hasSequence ? 3 : 2;
    const workIdx = hasSequence ? 4 : 3;
    const balanceIdx = hasSequence ? 5 : 4;

    const fullName = String(vals[nameIdx] ?? '').trim();
    const jobTitle = String(vals[titleIdx] ?? 'موظف').trim();
    const work = String(vals[workIdx] ?? '').toUpperCase();
    const isShifts = work === 'SHIFTS' || work === 'خفارات' || work === 'SHIFT';
    const deptCode = String(vals[deptIdx] ?? '').trim() || defaultDeptCode;
    const leaveBalance = parseInt(String(vals[balanceIdx] ?? 0), 10) || 0;

    return {
      fullName,
      jobTitle: jobTitle || 'موظف',
      departmentCode: deptCode,
      workType: isShifts ? 'SHIFTS' : 'MORNING',
      leaveBalance,
    };
  };

  const processImportFile = useCallback(
    (file: File) => {
      const defaultDept = (Array.isArray(depts) ? depts : []).find((d) => d.id === importDefaultDeptId);
      const defaultDeptCode = defaultDept?.code ?? '';
      if (!defaultDeptCode) {
        toast.error('اختر القسم الافتراضي أولاً');
        return;
      }
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const XLSX = await import('xlsx');
            const data = new Uint8Array(reader.result as ArrayBuffer);
            const wb = XLSX.read(data, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
            for (const key of Object.keys(sheet)) {
              if (key[0] === '!') continue;
              try {
                const coord = XLSX.utils.decode_cell(key);
                range.e.r = Math.max(range.e.r, coord.r);
                range.e.c = Math.max(range.e.c, coord.c);
              } catch {}
            }
            sheet['!ref'] = XLSX.utils.encode_range(range);
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number)[][];
            const rows = json.slice(1).map((row) => toRow(row, defaultDeptCode)).filter((r) => r.fullName);
            importMutation.mutate({ rows, fileName: file.name });
          } catch {
            toast.error('فشل قراءة ملف Excel');
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === 'csv' || ext === 'txt') {
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result);
          const lines = text.split(/\r?\n/).filter((l) => l.trim());
          const rows = lines
            .slice(1)
            .map((line) => {
              const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
              return toRow(parts, defaultDeptCode);
            })
            .filter((r) => r.fullName);
          importMutation.mutate({ rows, fileName: file.name });
        };
        reader.readAsText(file, 'UTF-8');
      } else {
        toast.error('نوع الملف غير مدعوم. استخدم xlsx أو csv');
      }
    },
    [depts, importDefaultDeptId]
  );

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImportFile(file);
    e.target.value = '';
  };

  const handleImportDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setImportDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImportFile(file);
  };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    const startDate = emp.balanceStartDate ? new Date(emp.balanceStartDate).toISOString().slice(0, 10) : '';
    setForm({
      fullName: emp.fullName,
      jobTitle: emp.jobTitle,
      departmentId: emp.department.id,
      managerUserId: emp.managerUser?.id ?? '',
      workType: (emp.workType === 'SHIFTS' ? 'SHIFTS' : 'MORNING') as 'MORNING' | 'SHIFTS',
      leaveBalance: String(Number(emp.leaveBalance) || 0),
      balanceStartDate: startDate,
      isActive: emp.isActive,
    });
    const fps = (emp.fingerprints ?? []).map((f) => ({
      id: f.id,
      deviceId: f.device.id,
      fingerprintId: f.fingerprintId,
      device: f.device,
    }));
    setEditFingerprints(fps);
    initialEditFingerprintIds.current = fps.map((f) => f.id!);
    setEditFpDeviceId('');
    setEditFpId('');
    setEditOpen(true);
  };

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(pageSize));
  if (debouncedSearch.trim().length >= 2) queryParams.set('search', debouncedSearch.trim());
  if (includeInactive) queryParams.set('includeInactive', 'true');
  if (incompleteOnly) queryParams.set('incompleteOnly', 'true');
  if (departmentFilter) queryParams.set('departmentId', departmentFilter);
  if (workTypeFilter) queryParams.set('workType', workTypeFilter);
  queryParams.set('sortBy', sortBy === 'department' ? 'department' : sortBy);
  queryParams.set('sortOrder', sortOrder);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['employees', page, pageSize, debouncedSearch, includeInactive, incompleteOnly, departmentFilter, workTypeFilter, sortBy, sortOrder],
    queryFn: () => apiGet<EmployeesResponse>(`/api/employees?${queryParams}`),
    staleTime: 60 * 1000,
  });

  const employees = data?.data ?? [];
  const total = data?.total ?? 0;
  const statsData = stats ?? { total: 0, active: 0, inactive: 0, morning: 0, shifts: 0 };

  const employeeIds = employees.map((e) => e.id);
  const { data: effectiveBalancesMap } = useQuery({
    queryKey: ['leave-requests', 'effective-balances', employeeIds.join(',')],
    queryFn: () =>
      apiGet<Record<string, number>>(
        `/api/leave-requests/effective-balances?ids=${employeeIds.map((id) => encodeURIComponent(id)).join(',')}`,
      ),
    staleTime: 0,
    refetchOnWindowFocus: true,
    enabled: employeeIds.length > 0,
  });
  const effectiveBalances = effectiveBalancesMap ?? {};

  const [exporting, setExporting] = useState(false);
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('limit', '100');
      if (debouncedSearch.trim().length >= 2) params.set('search', debouncedSearch.trim());
      if (includeInactive) params.set('includeInactive', 'true');
      if (incompleteOnly) params.set('incompleteOnly', 'true');
      if (departmentFilter) params.set('departmentId', departmentFilter);
      if (workTypeFilter) params.set('workType', workTypeFilter);
      params.set('sortBy', sortBy === 'department' ? 'department' : sortBy);
      params.set('sortOrder', sortOrder);
      const res = await apiGet<EmployeesResponse>(`/api/employees?${params}`);
      const list = res?.data ?? [];
      const headers = ['الاسم', 'العنوان الوظيفي', 'القسم', 'المسؤول', 'الرصيد', 'نوع الدوام', 'الحالة'];
      const rows = list.map((e) => [
        e.fullName,
        e.jobTitle ?? '',
        e.department?.name ?? '',
        e.managerUser?.name ?? e.manager?.fullName ?? '',
        String(e.leaveBalance),
        e.workType === 'SHIFTS' ? 'خفارات' : 'صباحي',
        e.isActive ? 'نشط' : 'متوقف',
      ]);
      downloadCSV(headers, rows, `موظفين-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`تم تصدير ${list.length} سجل`);
    } catch {
      toast.error('فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  const userOptions = (Array.isArray(users) ? users : []).map((u) => ({ value: u.id, label: u.name }));
  const deptOptions = (Array.isArray(depts) ? depts : []).map((d) => ({ value: d.id, label: d.name }));
  const deviceOptions = (Array.isArray(devicesList) ? devicesList : []).map((d) => ({
    value: d.id,
    label: d.code ? `${d.name} (${d.code})` : d.name,
  }));
  const deviceName = (id: string) => devicesList?.find((d) => d.id === id)?.name ?? id;
  const importDeptOptions = (Array.isArray(depts) ? depts : [])
    .filter((d) => d.code)
    .map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));

  const FormField = ({
    label,
    icon: Icon,
    children,
    colSpan = 1,
  }: {
    label: string;
    icon?: React.ElementType;
    children: React.ReactNode;
    colSpan?: 1 | 2;
  }) => (
    <div className={colSpan === 2 ? 'col-span-2' : ''}>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
        {Icon && <Icon className="h-4 w-4 text-gray-500" />}
        {label}
      </label>
      {children}
    </div>
  );

  const getLeaveBalanceValue = useCallback(() => {
    const raw = leaveBalanceInputRef.current?.value ?? '';
    return raw.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  }, []);

  const FormFields = ({ prepend, leaveBalanceKey }: { prepend?: React.ReactNode; leaveBalanceKey?: string } = {}) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {prepend != null && <div className="col-span-2">{prepend}</div>}
      <FormField label="الاسم الرباعي واللقب" icon={UserCircle}>
        <Input
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          placeholder="أدخل الاسم الكامل"
          required
        />
      </FormField>
      <FormField label="العنوان الوظيفي" icon={Briefcase}>
        <Input
          value={form.jobTitle}
          onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
          placeholder="مثال: طبيب استشاري"
          required
        />
      </FormField>
      <FormField label="القسم" icon={Building2}>
        <Select
          value={form.departmentId}
          onChange={(v) => setForm((f) => ({ ...f, departmentId: v }))}
          options={deptOptions}
          placeholder="اختر القسم"
        />
      </FormField>
      <FormField label="نوع الدوام" icon={Sun}>
        <Select
          value={form.workType}
          onChange={(v) => setForm((f) => ({ ...f, workType: (v as 'MORNING' | 'SHIFTS') || 'MORNING' }))}
          options={[
            { value: 'MORNING', label: 'صباحي' },
            { value: 'SHIFTS', label: 'خفارات' },
          ]}
          placeholder="صباحي"
        />
      </FormField>
      <FormField label="المسؤول المباشر">
        <Select
          value={form.managerUserId}
          onChange={(v) => setForm((f) => ({ ...f, managerUserId: v }))}
          options={userOptions}
          placeholder="اختياري"
        />
      </FormField>
      <FormField label="الرصيد التراكمي (عدد الأيام)">
        <Input
          ref={leaveBalanceInputRef}
          key={leaveBalanceKey ?? 'leave-balance'}
          inputMode="decimal"
          type="text"
          defaultValue={String(form.leaveBalance ?? '')}
          onInput={(e) => {
            const el = e.target as HTMLInputElement;
            const v = el.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
            if (el.value !== v) el.value = v;
          }}
          onBlur={(e) => {
            const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
            setForm((f) => ({ ...f, leaveBalance: v }));
          }}
          placeholder="0"
        />
      </FormField>
      <FormField label="هذا الرصيد صحيح لغاية تاريخ (إجباري عند إدخال رصيد)">
        <Input
          type="date"
          inputMode="none"
          autoComplete="off"
          value={form.balanceStartDate}
          onChange={(e) => setForm((f) => ({ ...f, balanceStartDate: e.target.value || '' }))}
          placeholder="اختر التاريخ"
        />
        <p className="text-xs text-gray-500 mt-1">
          عند الحفظ سيحسب النظام الرصيد الفعلي مرة واحدة (من التاريخ حتى اليوم مع خصم الإجازات المعتمدة) ويخزنه. بعدها يُخصم عند اعتماد إجازات ويُزاد يومياً بالاستحقاق.
        </p>
      </FormField>
      <FormField label="حالة الموظف">
        <Select
          value={form.isActive ? 'active' : 'suspended'}
          onChange={(v) => setForm((f) => ({ ...f, isActive: v === 'active' }))}
          options={[
            { value: 'active', label: 'نشط' },
            { value: 'suspended', label: 'متوقف' },
          ]}
        />
      </FormField>
    </div>
  );

  const SortableHead = ({
    label,
    field,
  }: {
    label: string;
    field: 'fullName' | 'jobTitle' | 'leaveBalance' | 'department' | 'updatedAt';
  }) => {
    const isActive = sortBy === field;
    return (
      <TableHead
        className="font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100/80 transition-colors"
        onClick={() => toggleSort(field)}
      >
        <div className="flex items-center gap-1">
          {label}
          {isActive ? (
            sortOrder === 'asc' ? (
              <ArrowUp className="h-4 w-4 text-primary-600" />
            ) : (
              <ArrowDown className="h-4 w-4 text-primary-600" />
            )
          ) : (
            <ArrowUpDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </TableHead>
    );
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">الموظفين</h1>
          <p className="text-gray-500 mt-1">إدارة بيانات الموظفين والأقسام</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            disabled={exporting || total === 0}
            className="gap-2"
          >
            <FileDown className="h-5 w-5" />
            {exporting ? 'جاري التصدير...' : 'تصدير CSV'}
          </Button>
          {canImport && (
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
              <Upload className="h-5 w-5" />
              استيراد Excel
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)} className="gap-2 shadow-md">
            <Plus className="h-5 w-5" />
            إضافة موظف
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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

      {/* Main Table Card */}
      <Card className="border-0 shadow-md overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gradient-to-l from-gray-50 to-white p-0">
          <div className="p-4 sm:p-5 space-y-4">
            {/* Search & Quick Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="بحث بالاسم أو العنوان الوظيفي..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pr-11 pl-4 bg-white border-gray-200"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setFiltersExpanded((f) => !f)}
                className="gap-2 shrink-0 min-h-[44px]"
              >
                <Filter className="h-4 w-4" />
                الفلاتر
              </Button>
            </div>

            {/* Expanded Filters */}
            {filtersExpanded && (
              <div className="flex flex-wrap gap-4 p-4 rounded-xl bg-white border border-gray-100">
                <div className="min-w-[160px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">القسم</label>
                  <Select
                    value={departmentFilter}
                    onChange={(v) => {
                      setDepartmentFilter(v);
                      setPage(1);
                    }}
                    options={[{ value: '', label: 'الكل' }, ...deptOptions]}
                    placeholder="الكل"
                  />
                </div>
                <div className="min-w-[140px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">نوع الدوام</label>
                  <Select
                    value={workTypeFilter}
                    onChange={(v) => {
                      setWorkTypeFilter(v);
                      setPage(1);
                    }}
                    options={[
                      { value: '', label: 'الكل' },
                      { value: 'MORNING', label: 'صباحي' },
                      { value: 'SHIFTS', label: 'خفارات' },
                    ]}
                    placeholder="الكل"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => {
                      setIncludeInactive(e.target.checked);
                      setPage(1);
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  عرض المتوقفين
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={incompleteOnly}
                    onChange={(e) => {
                      setIncompleteOnly(e.target.checked);
                      setPage(1);
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  من تحتاج إكمال بياناتهم فقط (بدون تاريخ رصيد)
                </label>
                {(departmentFilter || workTypeFilter || includeInactive || incompleteOnly) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDepartmentFilter('');
                      setWorkTypeFilter('');
                      setIncludeInactive(false);
                      setIncompleteOnly(false);
                      setPage(1);
                    }}
                  >
                    مسح الفلاتر
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={8} />
          ) : error ? (
            <ErrorState message="حدث خطأ في تحميل البيانات" onRetry={() => refetch()} />
          ) : employees.length === 0 ? (
            <EmptyState
              icon={Users}
              title="لا يوجد موظفين"
              description="أضف موظفين يدوياً أو استورد من ملف Excel"
              actionLabel="إضافة أول موظف"
              actionIcon={Plus}
              onAction={() => setAddOpen(true)}
            />
          ) : (
            <ResponsiveDataView
              cardClassName="p-4"
              tableContent={
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                      <SortableHead label="الاسم" field="fullName" />
                      <SortableHead label="العنوان الوظيفي" field="jobTitle" />
                      <SortableHead label="القسم" field="department" />
                      <TableHead className="font-semibold text-gray-700 min-w-[140px]">
                        <span className="flex items-center gap-1">
                          <Fingerprint className="h-4 w-4 text-violet-500" />
                          البصمة
                        </span>
                      </TableHead>
                      <TableHead className="font-semibold text-gray-700">المسؤول</TableHead>
                      <SortableHead label="رصيد الإجازات الاعتيادية" field="leaveBalance" />
                      <TableHead className="font-semibold text-gray-700">الدوام</TableHead>
                      <SortableHead label="آخر تحديث" field="updatedAt" />
                      <TableHead className="font-semibold text-gray-700">الحالة</TableHead>
                      <TableHead className="w-24 font-semibold text-gray-700"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((emp) => (
                      <TableRow
                        key={emp.id}
                        className="hover:bg-primary-50/30 transition-colors"
                      >
                        <TableCell className="font-medium">
                          <Link
                            href={`/dashboard/employees/${emp.id}`}
                            className="text-primary-700 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                          >
                            {emp.fullName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-gray-600">{emp.jobTitle}</TableCell>
                        <TableCell>{emp.department?.name ?? '—'}</TableCell>
                        <TableCell className="text-gray-600 text-sm">
                          {emp.fingerprints?.length ? (
                            <span className="flex flex-wrap gap-1">
                              {emp.fingerprints.map((fp) => (
                                <span
                                  key={fp.id}
                                  className="inline-flex items-center gap-0.5 bg-violet-50 text-violet-800 px-2 py-0.5 rounded text-xs"
                                  title={`${fp.device.name}: ${fp.fingerprintId}`}
                                >
                                  <Fingerprint className="h-3 w-3" />
                                  {fp.device.code || fp.device.name}: {fp.fingerprintId}
                                </span>
                              ))}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {emp.managerUser?.name ?? emp.manager?.fullName ?? '—'}
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-lg" title="رصيد الإجازات الاعتيادية">
                            {effectiveBalances[emp.id] != null
                              ? Math.floor(Number(effectiveBalances[emp.id]))
                              : Math.floor(Number(emp.leaveBalance) || 0)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {emp.workType === 'SHIFTS' ? (
                            <Badge variant="default" className="bg-violet-100 text-violet-800">خفارات</Badge>
                          ) : (
                            <Badge variant="default" className="bg-sky-100 text-sky-800">صباحي</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm whitespace-nowrap">
                          {emp.updatedAt
                            ? new Date(emp.updatedAt).toLocaleDateString('ar-EG', { dateStyle: 'short' })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={emp.isActive ? 'success' : 'default'}>
                            {emp.isActive ? 'نشط' : 'متوقف'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(emp)}
                            className="gap-1.5 text-gray-600 hover:text-primary-700"
                          >
                            <Pencil className="h-4 w-4" />
                            تعديل
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cardContent={
                <>
                  {employees.map((emp) => (
                    <Card key={emp.id} className="border border-gray-200 shadow-sm overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/dashboard/employees/${emp.id}`}
                              className="font-semibold text-primary-700 hover:underline block truncate"
                            >
                              {emp.fullName}
                            </Link>
                            <p className="text-sm text-gray-600 mt-0.5">{emp.jobTitle}</p>
                            <p className="text-xs text-gray-500 mt-1">{emp.department?.name ?? '—'}</p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <Badge variant={emp.isActive ? 'success' : 'default'} className="text-xs">
                                {emp.isActive ? 'نشط' : 'متوقف'}
                              </Badge>
                              {emp.workType === 'SHIFTS' ? (
                                <Badge variant="default" className="bg-violet-100 text-violet-800 text-xs">خفارات</Badge>
                              ) : (
                                <Badge variant="default" className="bg-sky-100 text-sky-800 text-xs">صباحي</Badge>
                              )}
                              <span className="text-xs text-gray-500">
                                رصيد: {effectiveBalances[emp.id] != null
                                  ? Math.floor(Number(effectiveBalances[emp.id]))
                                  : Math.floor(Number(emp.leaveBalance) || 0)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(emp)}
                              className="min-h-[44px] gap-1.5"
                            >
                              <Pencil className="h-4 w-4" />
                              تعديل
                            </Button>
                            <Link
                              href={`/dashboard/employees/${emp.id}`}
                              className="inline-flex items-center justify-center gap-1 min-h-[44px] px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 text-sm font-medium hover:bg-gray-100"
                            >
                              عرض
                              <ChevronLeft className="h-4 w-4 rotate-180" />
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              }
            />
          )}
        </CardContent>

        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-gray-100 px-5 py-4 bg-gray-50/50">
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-500">
                عرض {employees.length} من {total}
              </p>
              <div className="min-w-[120px]">
                <Select
                  value={String(pageSize)}
                  onChange={(v) => {
                    setPageSize(Number(v) || 10);
                    setPage(1);
                  }}
                  options={PAGE_SIZES.map((s) => ({ value: String(s), label: `${s} / صفحة` }))}
                  placeholder="10 / صفحة"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="gap-1"
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * pageSize >= total}
                className="gap-1"
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Edit Modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل موظف"
        className="max-w-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editingId) return;
            const balanceNum = Number(getLeaveBalanceValue()) || 0;
            if (balanceNum > 0 && !form.balanceStartDate?.trim()) {
              toast.error('عند إدخال رصيد يجب اختيار «هذا الرصيد صحيح لغاية تاريخ».');
              return;
            }
            const { leaveBalance: _lb, ...formRest } = form;
            editMutation.mutate({
              id: editingId,
              body: {
                ...formRest,
                leaveBalance: balanceNum,
                managerUserId: form.managerUserId || null,
                workType: form.workType || 'MORNING',
                balanceStartDate: form.balanceStartDate?.trim() ?? '',
              } as EmployeeFormBody,
            });
          }}
          className="space-y-6"
        >
          <FormFields
            leaveBalanceKey={editingId ? `leave-balance-edit-${editingId}` : undefined}
            prepend={
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <Fingerprint className="h-4 w-4 text-violet-500" />
                  جهاز البصمة ومعرف الموظف على الجهاز
                </label>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[180px]">
                    <span className="block text-xs text-gray-500 mb-1">الجهاز</span>
                    <Select value={editFpDeviceId} onChange={setEditFpDeviceId} options={deviceOptions} placeholder="اختر الجهاز" />
                  </div>
                  <div className="w-24">
                    <span className="block text-xs text-gray-500 mb-1">المعرف</span>
                    <Input value={editFpId} onChange={(e) => setEditFpId(e.target.value)} placeholder="7" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const fid = editFpId.trim();
                      if (!editFpDeviceId || !fid) return;
                      if (editFingerprints.some((f) => f.deviceId === editFpDeviceId && f.fingerprintId === fid)) return;
                      setEditFingerprints((prev) => [...prev, { deviceId: editFpDeviceId, fingerprintId: fid }]);
                      setEditFpId('');
                    }}
                  >
                    إضافة
                  </Button>
                </div>
                {editFingerprints.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {editFingerprints.map((fp) => (
                      <span
                        key={fp.id ?? `${fp.deviceId}-${fp.fingerprintId}`}
                        className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-800 px-2.5 py-1 rounded-lg text-sm"
                      >
                        {deviceName(fp.deviceId)}
                        {fp.device?.code && ` (${fp.device.code})`} → {fp.fingerprintId}
                        <button
                          type="button"
                          onClick={() =>
                            setEditFingerprints((prev) =>
                              prev.filter(
                                (p) => !(p.deviceId === fp.deviceId && p.fingerprintId === fp.fingerprintId && p.id === fp.id)
                              )
                            )
                          }
                          className="mr-0.5 p-0.5 rounded hover:bg-violet-200 text-violet-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            }
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={editMutation.isPending}>
              {editMutation.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Modal - Enhanced Design */}
      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setPendingFingerprints([]);
          setAddFpDeviceId('');
          setAddFpId('');
        }}
        title="إضافة موظف جديد"
        className="max-w-2xl"
      >
        <div className="mb-6 p-4 rounded-xl bg-primary-50/50 border border-primary-100">
          <p className="text-sm text-primary-800">
            أدخل بيانات الموظف الجديد. يمكنك أيضاً استيراد عدة موظفين دفعة واحدة من Excel.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const balanceNum = Number(getLeaveBalanceValue()) || 0;
            if (balanceNum > 0 && !form.balanceStartDate?.trim()) {
              toast.error('عند إدخال رصيد يجب اختيار «هذا الرصيد صحيح لغاية تاريخ».');
              return;
            }
            const { leaveBalance: _lb2, ...formRestAdd } = form;
            addMutation.mutate({
              body: {
                ...formRestAdd,
                leaveBalance: balanceNum,
                managerUserId: form.managerUserId || null,
                workType: form.workType || 'MORNING',
              } as EmployeeFormBody,
              fingerprints: pendingFingerprints,
            });
          }}
          className="space-y-6"
        >
          <FormFields
            leaveBalanceKey="leave-balance-add"
            prepend={
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <Fingerprint className="h-4 w-4 text-violet-500" />
                  جهاز البصمة ومعرف الموظف على الجهاز (اختياري)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  اختر جهاز الحضور وأدخل معرف البصمة كما يظهر على الجهاز. يمكن إضافة أكثر من جهاز لنفس الموظف.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[180px]">
                    <span className="block text-xs text-gray-500 mb-1">الجهاز</span>
                    <Select value={addFpDeviceId} onChange={setAddFpDeviceId} options={deviceOptions} placeholder="اختر الجهاز" />
                  </div>
                  <div className="w-24">
                    <span className="block text-xs text-gray-500 mb-1">المعرف</span>
                    <Input value={addFpId} onChange={(e) => setAddFpId(e.target.value)} placeholder="7" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const fid = addFpId.trim();
                      if (!addFpDeviceId || !fid) return;
                      if (pendingFingerprints.some((p) => p.deviceId === addFpDeviceId && p.fingerprintId === fid)) return;
                      setPendingFingerprints((prev) => [...prev, { deviceId: addFpDeviceId, fingerprintId: fid }]);
                      setAddFpId('');
                    }}
                  >
                    إضافة
                  </Button>
                </div>
                {pendingFingerprints.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {pendingFingerprints.map((fp) => (
                      <span
                        key={`${fp.deviceId}-${fp.fingerprintId}`}
                        className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-800 px-2.5 py-1 rounded-lg text-sm"
                      >
                        {deviceName(fp.deviceId)} → {fp.fingerprintId}
                        <button
                          type="button"
                          onClick={() =>
                            setPendingFingerprints((prev) =>
                              prev.filter((p) => !(p.deviceId === fp.deviceId && p.fingerprintId === fp.fingerprintId))
                            )
                          }
                          className="mr-0.5 p-0.5 rounded hover:bg-violet-200 text-violet-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            }
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={addMutation.isPending}>
              {addMutation.isPending ? 'جاري الإضافة...' : 'إضافة الموظف'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="استيراد موظفين من Excel أو CSV"
        className="max-w-lg"
      >
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-sm text-gray-700 mb-2">
              الصف الأول عناوين. يدعم التنسيقات:
            </p>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>تسلسل، الاسم، العنوان الوظيفي</li>
              <li>الاسم، العنوان الوظيفي</li>
            </ul>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">القسم الافتراضي (مطلوب)</label>
            <Select
              value={importDefaultDeptId}
              onChange={setImportDefaultDeptId}
              options={importDeptOptions}
              placeholder="اختر القسم"
            />
          </div>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              importDragOver
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setImportDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setImportDragOver(false);
            }}
            onDrop={handleImportDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="hidden"
              onChange={handleImportFile}
            />
            <div className="flex flex-col items-center gap-2">
              <div className="h-14 w-14 rounded-full bg-primary-100 flex items-center justify-center">
                <Upload className="h-7 w-7 text-primary-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">
                {importDragOver ? 'أفلت الملف هنا' : 'اسحب الملف هنا أو انقر للاختيار'}
              </span>
              <span className="text-xs text-gray-500">xlsx, xls, csv</span>
            </div>
          </div>
          {importMutation.isPending && (
            <div className="flex items-center gap-2 text-primary-600 text-sm">
              <span className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
              جاري الاستيراد...
            </div>
          )}
        </div>
      </Modal>
    </motion.div>
  );
}
