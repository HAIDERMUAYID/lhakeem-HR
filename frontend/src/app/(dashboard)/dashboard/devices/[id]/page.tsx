'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Fingerprint,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Users,
  UserMinus,
  Layers,
  Undo2,
  AlertCircle,
  Upload,
  FileSpreadsheet,
  Clock3,
  Search,
  ClipboardList,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';

type DeviceDetail = {
  id: string;
  name: string;
  code: string | null;
  location: string | null;
  isActive: boolean;
  fingerprints: {
    id: string;
    fingerprintId: string;
    employeeId: string;
    employee: { id: string; fullName: string; jobTitle: string };
  }[];
};

type EmployeeOption = {
  id: string;
  fullName: string;
  jobTitle: string;
  department?: { id: string; name: string };
};

type FingerprintRecord = {
  id: string;
  fingerprintId: string;
  deviceId: string;
  device: { id: string; name: string };
};

type ImportRejection = { rowNumber: number; reason: string };

type AttendanceImportBatch = {
  id: string;
  fileName: string;
  status: string;
  rowsTotal: number;
  rowsParsed: number;
  rowsAccepted: number;
  rowsRejected: number;
  createdAt: string;
  uploadedBy?: { id: string; name: string; username?: string | null } | null;
  _count?: { rawLogs: number; dailyRecords: number };
  rejections?: ImportRejection[] | null;
};

type AttendanceDailyRecord = {
  id: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  isValid: boolean;
  validationReason: string | null;
  employee: { id: string; fullName: string; jobTitle: string; department?: { name: string } | null };
  batch: { id: string; fileName: string; createdAt: string };
};

type AttendanceSheetRow = {
  employeeId: string;
  fullName: string;
  jobTitle: string;
  departmentName: string | null;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
  punchIsValid: boolean | null;
  punchNote: string | null;
  dayKind: 'LEAVE' | 'OFFICIAL_HOLIDAY' | 'REST_DAY' | 'WORK_EXPECTED';
  dayKindLabel: string;
  leaveTypeName: string | null;
  officialHolidayName: string | null;
  breakTimeLabel: string | null;
};

type AttendanceSheetResponse = {
  deviceId: string;
  batchId: string | null;
  fromDate: string;
  toDate: string;
  employeeCount: number;
  rowCount: number;
  rows: AttendanceSheetRow[];
};

/** عرض التواريخ والأوقات بأرقام لاتينية (إنجليزية) مع بقاء واجهة عربية */
const DISPLAY_LOCALE = 'en-GB';

function formatLatinDate(iso: string) {
  return new Date(iso).toLocaleDateString(DISPLAY_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  });
}

function formatLatinTime(iso: string) {
  return new Date(iso).toLocaleTimeString(DISPLAY_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    numberingSystem: 'latn',
  });
}

function formatLatinDateTime(iso: string) {
  return new Date(iso).toLocaleString(DISPLAY_LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    numberingSystem: 'latn',
  });
}

function sheetDayKindClass(kind: AttendanceSheetRow['dayKind']) {
  switch (kind) {
    case 'LEAVE':
      return 'bg-violet-50 text-violet-800';
    case 'OFFICIAL_HOLIDAY':
      return 'bg-sky-50 text-sky-800';
    case 'REST_DAY':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-gray-50 text-gray-700';
  }
}

export default function DeviceDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const deviceId = params?.id as string;

  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [editFingerprintId, setEditFingerprintId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [fingerprintInputs, setFingerprintInputs] = useState<Record<string, string>>({});
  const [conflictEmployee, setConflictEmployee] = useState<{
    employeeId: string;
    fullName: string;
    otherDevices: { recordId: string; deviceName: string }[];
    fingerprintId: string;
  } | null>(null);
  const [conflictChoice, setConflictChoice] = useState<'move' | 'add_both' | 'skip' | null>(null);
  const [addStep, setAddStep] = useState<'select' | 'ids' | 'confirm'>('select');
  const [addSearch, setAddSearch] = useState('');
  /** أسماء الموظفين المختارين عند الانتقال لخطوة إدخال المعرف (لتجنب ظهور الـ ID إذا تغيّرت القائمة) */
  const [selectedEmployeesSnapshot, setSelectedEmployeesSnapshot] = useState<{ id: string; fullName: string }[]>([]);
  const [addStepLoading, setAddStepLoading] = useState(false);
  const [attendanceFile, setAttendanceFile] = useState<File | null>(null);
  const [recordsFromDate, setRecordsFromDate] = useState('');
  const [recordsToDate, setRecordsToDate] = useState('');
  const [attendanceRecordSearch, setAttendanceRecordSearch] = useState('');
  /** واجهة واحدة في كل مرة: موظفو الجهاز أو الحضور والانصراف */
  const [deviceViewTab, setDeviceViewTab] = useState<'employees' | 'attendance'>('employees');
  const [importRejectionsModal, setImportRejectionsModal] = useState<{
    open: boolean;
    title: string;
    items: ImportRejection[];
  }>({ open: false, title: '', items: [] });
  /** كشف الجهاز: دفعة رفع أو نطاق تواريخ */
  const [sheetMode, setSheetMode] = useState<'batch' | 'range'>('batch');
  const [sheetBatchId, setSheetBatchId] = useState('');
  const [sheetFromDate, setSheetFromDate] = useState('');
  const [sheetToDate, setSheetToDate] = useState('');
  const [sheetSearch, setSheetSearch] = useState('');

  const { data: device, isLoading, error } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => apiGet<DeviceDetail>(`/api/devices/${deviceId}`),
    enabled: !!deviceId,
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employees-list', addSearch],
    queryFn: () =>
      apiGet<{ data: EmployeeOption[]; total: number }>(
        `/api/employees?limit=500&${addSearch ? `search=${encodeURIComponent(addSearch)}` : ''}`
      ),
    enabled: addOpen,
  });

  const employeesList = employeesData?.data ?? [];
  const alreadyOnDevice = new Set((device?.fingerprints ?? []).map((f) => f.employeeId));

  const { data: attendanceImports, isLoading: attendanceImportsLoading } = useQuery({
    queryKey: ['attendance-imports', deviceId],
    queryFn: () => apiGet<AttendanceImportBatch[]>(`/api/devices/${deviceId}/attendance-imports`),
    enabled: !!deviceId,
  });

  const recordsQuery = new URLSearchParams();
  if (recordsFromDate) recordsQuery.set('fromDate', recordsFromDate);
  if (recordsToDate) recordsQuery.set('toDate', recordsToDate);
  const { data: attendanceDailyRecords, isLoading: attendanceDailyLoading } = useQuery({
    queryKey: ['attendance-daily-records', deviceId, recordsFromDate, recordsToDate],
    queryFn: () =>
      apiGet<AttendanceDailyRecord[]>(
        `/api/devices/${deviceId}/attendance-daily-records${recordsQuery.toString() ? `?${recordsQuery}` : ''}`,
      ),
    enabled: !!deviceId,
  });

  const fingerprintsSorted = useMemo(() => {
    const list = device?.fingerprints ?? [];
    return [...list].sort((a, b) =>
      a.fingerprintId.localeCompare(b.fingerprintId, undefined, { numeric: true, sensitivity: 'base' }),
    );
  }, [device?.fingerprints]);

  const attendanceFiltered = useMemo(() => {
    const list = attendanceDailyRecords ?? [];
    const q = attendanceRecordSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const name = r.employee.fullName.toLowerCase();
      const job = (r.employee.jobTitle ?? '').toLowerCase();
      return name.includes(q) || job.includes(q);
    });
  }, [attendanceDailyRecords, attendanceRecordSearch]);

  useEffect(() => {
    if (sheetMode !== 'batch' || sheetBatchId || !(attendanceImports ?? []).length) return;
    setSheetBatchId((attendanceImports ?? [])[0].id);
  }, [sheetMode, sheetBatchId, attendanceImports]);

  const sheetQueryEnabled =
    !!deviceId &&
    deviceViewTab === 'attendance' &&
    (sheetMode === 'batch' ? !!sheetBatchId : !!(sheetFromDate && sheetToDate));

  const { data: attendanceSheet, isLoading: sheetLoading, error: sheetQueryError } = useQuery({
    queryKey: ['attendance-sheet', deviceId, sheetMode, sheetBatchId, sheetFromDate, sheetToDate],
    queryFn: () => {
      const p = new URLSearchParams();
      if (sheetMode === 'batch') p.set('batchId', sheetBatchId);
      else {
        p.set('fromDate', sheetFromDate);
        p.set('toDate', sheetToDate);
      }
      return apiGet<AttendanceSheetResponse>(`/api/devices/${deviceId}/attendance-sheet?${p}`);
    },
    enabled: sheetQueryEnabled,
  });

  const sheetFiltered = useMemo(() => {
    const list = attendanceSheet?.rows ?? [];
    const q = sheetSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const name = r.fullName.toLowerCase();
      const job = (r.jobTitle ?? '').toLowerCase();
      const dept = (r.departmentName ?? '').toLowerCase();
      return name.includes(q) || job.includes(q) || dept.includes(q);
    });
  }, [attendanceSheet?.rows, sheetSearch]);

  const updateFingerprintMutation = useMutation({
    mutationFn: ({
      employeeId,
      recordId,
      fingerprintId,
    }: {
      employeeId: string;
      recordId: string;
      fingerprintId: string;
    }) => apiPatch(`/api/employees/${employeeId}/fingerprints/${recordId}`, { fingerprintId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      setEditRecordId(null);
      setEditFingerprintId('');
      toast.success('تم تحديث معرف البصمة');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: ({ employeeId, recordId }: { employeeId: string; recordId: string }) =>
      apiDelete(`/api/employees/${employeeId}/fingerprints/${recordId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['devices-stats'] });
      toast.success('تم حذف الموظف من الجهاز');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addFingerprintMutation = useMutation({
    mutationFn: ({
      employeeId,
      deviceId: devId,
      fingerprintId,
    }: {
      employeeId: string;
      deviceId: string;
      fingerprintId: string;
    }) => apiPost(`/api/employees/${employeeId}/fingerprints`, { deviceId: devId, fingerprintId }),
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadAttendanceMutation = useMutation({
    mutationFn: async () => {
      if (!attendanceFile) throw new Error('اختر ملف Excel أولاً');
      const fd = new FormData();
      fd.append('file', attendanceFile);
      return apiUpload<{
        ok: boolean;
        rowsTotal: number;
        rowsAccepted: number;
        rowsRejected: number;
        warningsCount?: number;
        rejections?: ImportRejection[];
      }>(`/api/devices/${deviceId}/attendance-imports`, fd);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-imports', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-daily-records', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-sheet', deviceId] });
      setAttendanceFile(null);
      const rej = res.rejections ?? [];
      if (rej.length > 0) {
        setImportRejectionsModal({
          open: true,
          title: `الأخطاء والتنبيهات بعد الرفع (${rej.length})`,
          items: rej,
        });
      }
      const w = res.warningsCount ?? 0;
      toast.success(
        `تمت معالجة الملف: إجمالي صفوف ${res.rowsTotal} — سجلات يومية ${res.rowsAccepted} — صفوف مرفوضة ${res.rowsRejected}${w > 0 ? ` — تنبيهات معالجة ${w}` : ''}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAttendanceImportMutation = useMutation({
    mutationFn: (batchId: string) =>
      apiDelete<{ ok: boolean }>(`/api/devices/${deviceId}/attendance-imports/${batchId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-imports', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-daily-records', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['attendance-sheet', deviceId] });
      toast.success('تم حذف ملف الرفع وكل سجلات الحضور/الانصراف التابعة له');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (record: { id: string; fingerprintId: string }) => {
    setEditRecordId(record.id);
    setEditFingerprintId(record.fingerprintId);
  };

  const handleRemove = (employeeId: string, recordId: string, fullName: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`حذف ${fullName} من هذا الجهاز؟ لن يُحذف الموظف من النظام.`)) return;
    removeMutation.mutate({ employeeId, recordId });
  };

  const toggleEmployee = (id: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goToIdsStep = async () => {
    if (selectedEmployeeIds.size === 0) {
      toast.error('اختر موظفاً واحداً على الأقل');
      return;
    }
    const ids = Array.from(selectedEmployeeIds);
    const snapshot: { id: string; fullName: string }[] = [];
    const needFetch = ids.filter((id) => {
      const name = employeesList.find((e) => e.id === id)?.fullName;
      return !name || name.trim() === '' || name === id;
    });

    if (needFetch.length > 0) {
      setAddStepLoading(true);
      try {
        const fetched = await Promise.all(
          needFetch.map(async (id) => {
            const emp = await apiGet<{ fullName: string }>(`/api/employees/${id}`);
            return { id, fullName: emp?.fullName?.trim() || id };
          }),
        );
        const byId = new Map(fetched.map((e) => [e.id, e.fullName]));
        for (const id of ids) {
          const fromList = employeesList.find((e) => e.id === id)?.fullName;
          const name = (fromList?.trim() && fromList !== id ? fromList : null) ?? byId.get(id) ?? id;
          snapshot.push({ id, fullName: name });
        }
      } catch {
        toast.error('تعذّر تحميل أسماء الموظفين');
        setAddStepLoading(false);
        return;
      }
      setAddStepLoading(false);
    } else {
      for (const id of ids) {
        snapshot.push({
          id,
          fullName: employeesList.find((e) => e.id === id)?.fullName ?? id,
        });
      }
    }

    setSelectedEmployeesSnapshot(snapshot);
    setFingerprintInputs({});
    setAddStep('ids');
  };

  const getEmployeeFingerprints = async (employeeId: string): Promise<FingerprintRecord[]> => {
    const list = await apiGet<FingerprintRecord[]>(`/api/employees/${employeeId}/fingerprints`);
    return Array.isArray(list) ? list : [];
  };

  const submitAddWithConflicts = async (
    initialUsedIds?: Set<string>,
    employeeIdsToProcess?: string[],
  ) => {
    const list = employeeIdsToProcess ?? Array.from(selectedEmployeeIds);
    const usedIds = initialUsedIds ?? new Set((device?.fingerprints ?? []).map((f) => f.fingerprintId));
    const errors: string[] = [];

    const getName = (eid: string) =>
      selectedEmployeesSnapshot.find((s) => s.id === eid)?.fullName ??
      employeesList.find((e) => e.id === eid)?.fullName ??
      eid;
    for (const empId of list) {
      const fid = (fingerprintInputs[empId] ?? '').trim();
      if (!fid) {
        errors.push(`معرف البصمة مطلوب لـ ${getName(empId)}`);
        continue;
      }
      if (usedIds.has(fid)) {
        errors.push(`معرف البصمة "${fid}" مستخدم على هذا الجهاز (${getName(empId)})`);
        continue;
      }

      const existing = await getEmployeeFingerprints(empId);
      const onOtherDevices = existing.filter((r) => r.deviceId !== deviceId);

      if (onOtherDevices.length > 0) {
        setConflictEmployee({
          employeeId: empId,
          fullName: getName(empId),
          otherDevices: onOtherDevices.map((r) => ({ recordId: r.id, deviceName: r.device.name })),
          fingerprintId: fid,
        });
        setConflictChoice(null);
        return;
      }

      try {
        await apiPost(`/api/employees/${empId}/fingerprints`, { deviceId, fingerprintId: fid });
        usedIds.add(fid);
        queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
        queryClient.invalidateQueries({ queryKey: ['devices'] });
      } catch (err) {
        errors.push((err as Error).message);
      }
    }

    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    toast.success('تمت إضافة الموظفين للجهاز');
    setAddOpen(false);
    setAddStep('select');
    setSelectedEmployeeIds(new Set());
    setFingerprintInputs({});
  };

  const resolveConflict = async () => {
    if (!conflictEmployee || conflictChoice === null) return;
    const { employeeId, fingerprintId, otherDevices } = conflictEmployee;
    const usedIds = new Set((device?.fingerprints ?? []).map((f) => f.fingerprintId));
    if (usedIds.has(fingerprintId)) {
      toast.error(`معرف البصمة "${fingerprintId}" مستخدم على هذا الجهاز`);
      setConflictEmployee(null);
      setConflictChoice(null);
      return;
    }

    try {
      if (conflictChoice === 'move') {
        for (const { recordId } of otherDevices) {
          await apiDelete(`/api/employees/${employeeId}/fingerprints/${recordId}`);
        }
      }
      if (conflictChoice === 'move' || conflictChoice === 'add_both') {
        await apiPost(`/api/employees/${employeeId}/fingerprints`, { deviceId, fingerprintId });
      }
      queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      if (conflictChoice === 'skip') {
        toast('تم الإلغاء للموظف');
      } else {
        toast.success(conflictChoice === 'move' ? 'تم نقل الموظف لهذا الجهاز' : 'تمت إضافته على الجهازين');
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
    setConflictEmployee(null);
    setConflictChoice(null);
    const remaining = new Set(selectedEmployeeIds);
    remaining.delete(employeeId);
    setSelectedEmployeeIds(remaining);
    if (remaining.size === 0) {
      setAddOpen(false);
      setAddStep('select');
      setFingerprintInputs({});
    } else {
      const nextUsed = new Set((device?.fingerprints ?? []).map((f) => f.fingerprintId));
      if (conflictChoice === 'move' || conflictChoice === 'add_both') nextUsed.add(conflictEmployee.fingerprintId);
      setSelectedEmployeeIds(remaining);
      await submitAddWithConflicts(nextUsed, Array.from(remaining));
    }
  };

  const handleSubmitAdd = async () => {
    const list = Array.from(selectedEmployeeIds);
    const missing = list.filter((eid) => !(fingerprintInputs[eid] ?? '').trim());
    if (missing.length > 0) {
      const getName = (eid: string) =>
        selectedEmployeesSnapshot.find((s) => s.id === eid)?.fullName ??
        employeesList.find((e) => e.id === eid)?.fullName ??
        eid;
      const names = missing.map(getName).join(', ');
      toast.error(`أدخل معرف البصمة للموظفين: ${names}`);
      return;
    }
    const usedIds = new Set((device?.fingerprints ?? []).map((f) => f.fingerprintId));
    for (const eid of list) {
      const fid = (fingerprintInputs[eid] ?? '').trim();
      if (usedIds.has(fid)) {
        toast.error(`معرف البصمة "${fid}" مستخدم على هذا الجهاز. اختر معرفاً آخر.`);
        return;
      }
    }
    await submitAddWithConflicts();
  };

  if (!deviceId) {
    return (
      <div className="p-6">
        <p className="text-gray-500">معرف الجهاز غير صالح.</p>
        <Link href="/dashboard/devices">
          <Button variant="outline" className="mt-4 min-h-[44px]">العودة للأجهزة</Button>
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-600">حدث خطأ في تحميل الجهاز.</p>
        <Link href="/dashboard/devices">
          <Button variant="outline" className="mt-4 min-h-[44px]">العودة للأجهزة</Button>
        </Link>
      </div>
    );
  }

  const fingerprints = fingerprintsSorted;
  const editingRecord = editRecordId ? fingerprints.find((f) => f.id === editRecordId) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/dashboard/devices" className="hover:text-primary-600">
            أجهزة البصمة
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-900 font-medium">{device?.name ?? '...'}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shrink-0">
            <Fingerprint className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{device?.name ?? '...'}</h1>
            {device?.code && <p className="text-gray-500">{device.code}</p>}
            {device?.location && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin className="h-4 w-4" />
                {device.location}
              </p>
            )}
          </div>
        </div>
      </div>

      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          <div
            role="tablist"
            aria-label="اختيار قسم الجهاز"
            className="flex flex-col sm:flex-row gap-2 sm:inline-flex sm:gap-1 rounded-xl border border-gray-200 bg-gray-100/90 p-1 w-full sm:w-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={deviceViewTab === 'employees'}
              id="tab-device-employees"
              aria-controls="panel-device-employees"
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-4 py-3 sm:py-2.5 text-sm font-medium min-h-[48px] sm:min-h-[44px] transition-all',
                deviceViewTab === 'employees'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60',
              )}
              onClick={() => setDeviceViewTab('employees')}
            >
              <Users className="h-4 w-4 shrink-0 text-violet-600" />
              إدارة موظفي الجهاز
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={deviceViewTab === 'attendance'}
              id="tab-device-attendance"
              aria-controls="panel-device-attendance"
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-4 py-3 sm:py-2.5 text-sm font-medium min-h-[48px] sm:min-h-[44px] transition-all',
                deviceViewTab === 'attendance'
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60',
              )}
              onClick={() => setDeviceViewTab('attendance')}
            >
              <Clock3 className="h-4 w-4 shrink-0 text-blue-600" />
              الحضور والانصراف
            </button>
          </div>
        </CardContent>
      </Card>

      {/* إدارة موظفي الجهاز */}
      {deviceViewTab === 'employees' && (
      <Card
        className="border-0 shadow-md overflow-hidden"
        id="panel-device-employees"
        role="tabpanel"
        aria-labelledby="tab-device-employees"
      >
        <CardContent className="p-0">
          <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-12 w-12 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                <Users className="h-6 w-6 text-violet-700" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">موظفو الجهاز</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  الربط بمعرف البصمة على هذا الجهاز — معرف الجهاز:{' '}
                  <span className="font-mono text-gray-800 tabular-nums" dir="ltr">
                    {deviceId}
                  </span>
                </p>
              </div>
            </div>
            <Button onClick={() => setAddOpen(true)} className="gap-2 shadow-md min-h-[44px] shrink-0">
              <Plus className="h-5 w-5" />
              إضافة موظفين
            </Button>
          </div>
          {isLoading ? (
            <div className="p-8 grid gap-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : fingerprints.length === 0 ? (
            <EmptyState
              icon={Users}
              title="لا يوجد موظفين على هذا الجهاز"
              description="أضف موظفين وحدد معرف البصمة لكل منهم. يمكنك لاحقاً تعديل المعرف أو حذف الربط (إزالة من الجهاز)."
              actionLabel="إضافة موظفين"
              actionIcon={Plus}
              onAction={() => setAddOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">الموظف</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">الوظيفة</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">معرف البصمة</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 w-36">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {fingerprints.map((rec) => (
                    <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-4">
                        <Link
                          href={`/dashboard/employees/${rec.employee.id}`}
                          className="font-medium text-primary-600 hover:underline"
                        >
                          {rec.employee.fullName}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{rec.employee.jobTitle}</td>
                      <td className="py-3 px-4">
                        {editingRecord?.id === rec.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editFingerprintId}
                              onChange={(e) => setEditFingerprintId(e.target.value)}
                              className="w-32"
                              placeholder="المعرف"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() =>
                                updateFingerprintMutation.mutate({
                                  employeeId: rec.employeeId,
                                  recordId: rec.id,
                                  fingerprintId: editFingerprintId,
                                })
                              }
                              disabled={updateFingerprintMutation.isPending || !editFingerprintId.trim()}
                              className="min-h-[44px]"
                            >
                              حفظ
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditRecordId(null)} className="min-h-[44px]">
                              إلغاء
                            </Button>
                          </div>
                        ) : (
                          <span className="font-mono text-gray-800">{rec.fingerprintId}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {editingRecord?.id !== rec.id && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(rec)}
                              className="gap-1 text-gray-600 min-h-[44px]"
                            >
                              <Pencil className="h-4 w-4" />
                              تعديل
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemove(rec.employeeId, rec.id, rec.employee.fullName)}
                              className="gap-1 text-red-600 hover:bg-red-50 min-h-[44px]"
                            >
                              <Trash2 className="h-4 w-4" />
                              حذف
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* الحضور والانصراف */}
      {deviceViewTab === 'attendance' && (
      <Card
        className="border-0 shadow-md overflow-hidden"
        id="panel-device-attendance"
        role="tabpanel"
        aria-labelledby="tab-device-attendance"
      >
        <CardContent className="p-5 space-y-8">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">الحضور والانصراف</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <h3 className="text-base font-semibold text-gray-900">استيراد من Excel</h3>
            </div>
            <p className="text-sm text-gray-600">
              عمودان: <span className="font-medium">رقم البصمة</span> و
              <span className="font-medium"> التاريخ والوقت</span>. لكل يوم أول بصمة حضور وآخر بصمة انصراف مع فرق 3 ساعات؛ بصمة واحدة قبل الظهر = حضور فقط، ومن الظهر فما فوق = انصراف فقط.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setAttendanceFile(e.target.files?.[0] ?? null)}
                className="max-w-md"
              />
              <Button
                className="gap-2 min-h-[44px]"
                disabled={!attendanceFile || uploadAttendanceMutation.isPending}
                onClick={() => uploadAttendanceMutation.mutate()}
              >
                <Upload className="h-4 w-4" />
                {uploadAttendanceMutation.isPending ? 'جاري الرفع...' : 'رفع الملف'}
              </Button>
            </div>
            {attendanceFile && (
              <p className="text-xs text-gray-500">
                الملف المختار: <span className="font-medium">{attendanceFile.name}</span>
              </p>
            )}
          </div>

          <div className="border-t border-gray-100 pt-6 space-y-3">
            <h3 className="font-medium text-gray-900">سجل عمليات الرفع</h3>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              {attendanceImportsLoading ? (
                <div className="p-4 text-sm text-gray-500">جاري تحميل سجل الرفع...</div>
              ) : (attendanceImports ?? []).length === 0 ? (
                <div className="p-4 text-sm text-gray-500">لا توجد عمليات رفع حتى الآن</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {(attendanceImports ?? []).map((b) => (
                    <div key={b.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{b.fileName}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          <span dir="ltr" className="tabular-nums font-mono">
                            {formatLatinDateTime(b.createdAt)}
                          </span>
                          <span> · مقبول </span>
                          <span dir="ltr" className="tabular-nums">
                            {b.rowsAccepted}
                          </span>
                          <span> / مرفوض </span>
                          <span dir="ltr" className="tabular-nums">
                            {b.rowsRejected}
                          </span>
                          <span> / إجمالي </span>
                          <span dir="ltr" className="tabular-nums">
                            {b.rowsTotal}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            b.status === 'SUCCESS'
                              ? 'bg-emerald-50 text-emerald-700'
                              : b.status === 'PARTIAL'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {b.status}
                        </span>
                        {Array.isArray(b.rejections) && b.rejections.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-[40px] gap-1"
                            onClick={() =>
                              setImportRejectionsModal({
                                open: true,
                                title: `${b.fileName} — ${b.rejections!.length} بند`,
                                items: b.rejections!,
                              })
                            }
                          >
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            عرض الأخطاء
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50 min-h-[40px]"
                          disabled={deleteAttendanceImportMutation.isPending}
                          onClick={() => {
                            if (
                              typeof window !== 'undefined' &&
                              window.confirm('حذف عملية الرفع هذه؟ سيتم حذف سجلات الحضور/الانصراف الناتجة عنها.')
                            ) {
                              deleteAttendanceImportMutation.mutate(b.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 ml-1" />
                          حذف
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-semibold text-gray-900">كشف الحضور والانصراف</h3>
            </div>
            <p className="text-sm text-gray-600">
              يظهر <span className="font-medium">كل موظفي الجهاز النشطين</span> لكل يوم في النطاق. من دون بصمة تبقى خلايا الحضور/الانصراف فارغة. تُعرض{' '}
              <span className="font-medium">الإجازة المعتمدة</span>، <span className="font-medium">يوم الاستراحة</span> حسب جدول الدوام،{' '}
              <span className="font-medium">العطلة الرسمية</span> (للموظفين الصباحيين عند الانطباق)، و<span className="font-medium">وقت الاستراحة</span> من الجدول
              في أيام العمل المتوقعة.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
              <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 gap-1">
                <button
                  type="button"
                  className={`px-3 py-2 text-sm rounded-md min-h-[44px] transition-colors ${
                    sheetMode === 'batch' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                  }`}
                  onClick={() => setSheetMode('batch')}
                >
                  حسب دفعة الرفع
                </button>
                <button
                  type="button"
                  className={`px-3 py-2 text-sm rounded-md min-h-[44px] transition-colors ${
                    sheetMode === 'range' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                  }`}
                  onClick={() => setSheetMode('range')}
                >
                  حسب نطاق التاريخ
                </button>
              </div>
              {sheetMode === 'batch' ? (
                <div className="flex-1 min-w-[200px] max-w-md">
                  <label className="block text-xs text-gray-500 mb-1">دفعة الرفع</label>
                  <select
                    className="w-full h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900"
                    value={sheetBatchId}
                    onChange={(e) => setSheetBatchId(e.target.value)}
                  >
                    <option value="">— اختر —</option>
                    {(attendanceImports ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.fileName} ({formatLatinDateTime(b.createdAt)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">من</label>
                    <Input
                      type="date"
                      value={sheetFromDate}
                      onChange={(e) => setSheetFromDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">إلى</label>
                    <Input
                      type="date"
                      value={sheetToDate}
                      onChange={(e) => setSheetToDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                </div>
              )}
              <div className="flex-1 min-w-[200px] max-w-md">
                <label className="block text-xs text-gray-500 mb-1">بحث في الكشف</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    value={sheetSearch}
                    onChange={(e) => setSheetSearch(e.target.value)}
                    placeholder="اسم الموظف، الوظيفة، القسم…"
                    className="pr-10"
                  />
                </div>
              </div>
            </div>
            {!sheetQueryEnabled && (
              <p className="text-sm text-gray-500">
                {sheetMode === 'batch'
                  ? 'اختر دفعة رفع لعرض الكشف.'
                  : 'حدد من تاريخ وإلى تاريخ (حد أقصى 120 يوماً).'}
              </p>
            )}
            {sheetQueryEnabled && sheetLoading && (
              <div className="text-sm text-gray-500 py-3">جاري تحميل الكشف...</div>
            )}
            {sheetQueryEnabled && sheetQueryError && (
              <div className="text-sm text-rose-600 py-3">{(sheetQueryError as Error).message}</div>
            )}
            {sheetQueryEnabled && !sheetLoading && attendanceSheet && (
              <p className="text-xs text-gray-500">
                النطاق{' '}
                <span dir="ltr" className="tabular-nums font-mono">
                  {attendanceSheet.fromDate}
                </span>
                {' — '}
                <span dir="ltr" className="tabular-nums font-mono">
                  {attendanceSheet.toDate}
                </span>
                {' · '}
                <span dir="ltr" className="tabular-nums">
                  {attendanceSheet.employeeCount}
                </span>{' '}
                موظفاً ·{' '}
                <span dir="ltr" className="tabular-nums">
                  {attendanceSheet.rowCount}
                </span>{' '}
                سطراً
              </p>
            )}
            {sheetQueryEnabled && !sheetLoading && attendanceSheet && attendanceSheet.rows.length === 0 && (
              <div className="text-sm text-gray-500 py-2">لا توجد صفوف (لا موظفين نشطين على الجهاز أو نطاق فارغ).</div>
            )}
            {sheetQueryEnabled && !sheetLoading && attendanceSheet && attendanceSheet.rows.length > 0 && sheetFiltered.length === 0 && (
              <div className="text-sm text-amber-700 py-2">لا توجد نتائج تطابق البحث.</div>
            )}
            {sheetQueryEnabled && !sheetLoading && attendanceSheet && sheetFiltered.length > 0 && (
              <div className="overflow-x-auto border border-gray-100 rounded-xl max-h-[min(70vh,720px)] overflow-y-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="sticky top-0 z-[1] bg-gray-50 border-b border-gray-100 text-gray-600">
                    <tr>
                      <th className="text-right px-3 py-2">الموظف</th>
                      <th className="text-right px-3 py-2">القسم</th>
                      <th className="text-right px-3 py-2">التاريخ</th>
                      <th className="text-right px-3 py-2">حالة اليوم</th>
                      <th className="text-right px-3 py-2">إجازة</th>
                      <th className="text-right px-3 py-2">عطلة</th>
                      <th className="text-right px-3 py-2">استراحة (جدول)</th>
                      <th className="text-right px-3 py-2">الحضور</th>
                      <th className="text-right px-3 py-2">الانصراف</th>
                      <th className="text-right px-3 py-2">ساعات</th>
                      <th className="text-right px-3 py-2">ملاحظة بصمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheetFiltered.map((row, idx) => (
                      <tr key={`${row.employeeId}-${row.workDate}-${idx}`} className="border-b border-gray-50 align-top">
                        <td className="px-3 py-2 font-medium text-gray-900">{row.fullName}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{row.departmentName ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span dir="ltr" className="tabular-nums">
                            {formatLatinDate(`${row.workDate}T12:00:00`)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sheetDayKindClass(row.dayKind)}`}>
                            {row.dayKindLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-700">{row.leaveTypeName ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-700">{row.officialHolidayName ?? '—'}</td>
                        <td className="px-3 py-2 text-xs" dir="ltr">
                          {row.breakTimeLabel ? (
                            <span className="tabular-nums font-mono">{row.breakTimeLabel}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.checkInAt ? (
                            <span dir="ltr" className="tabular-nums">
                              {formatLatinTime(row.checkInAt)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.checkOutAt ? (
                            <span dir="ltr" className="tabular-nums">
                              {formatLatinTime(row.checkOutAt)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.workedMinutes != null ? (
                            <span dir="ltr" className="tabular-nums">
                              {(row.workedMinutes / 60).toFixed(2)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[180px]">
                          {row.punchIsValid === false ? (
                            <span className="text-rose-700">{row.punchNote ?? 'غير صالح'}</span>
                          ) : row.punchNote ? (
                            <span className="text-gray-600">{row.punchNote}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">سجلات الحضور والانصراف</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">من تاريخ</label>
                <Input
                  type="date"
                  value={recordsFromDate}
                  onChange={(e) => setRecordsFromDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">إلى تاريخ</label>
                <Input
                  type="date"
                  value={recordsToDate}
                  onChange={(e) => setRecordsToDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex-1 min-w-[200px] max-w-md">
                <label className="block text-xs text-gray-500 mb-1">بحث</label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    value={attendanceRecordSearch}
                    onChange={(e) => setAttendanceRecordSearch(e.target.value)}
                    placeholder="اسم الموظف، الوظيفة…"
                    className="pr-10"
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => {
                  setRecordsFromDate('');
                  setRecordsToDate('');
                  setAttendanceRecordSearch('');
                }}
              >
                مسح الفلاتر والبحث
              </Button>
            </div>
            {attendanceDailyLoading ? (
              <div className="text-sm text-gray-500 py-3">جاري تحميل السجلات...</div>
            ) : (attendanceDailyRecords ?? []).length === 0 ? (
              <div className="text-sm text-gray-500 py-3">لا توجد سجلات حضور/انصراف لهذا الجهاز</div>
            ) : attendanceFiltered.length === 0 ? (
              <div className="text-sm text-amber-700 py-3">لا توجد نتائج تطابق البحث أو الفلترة الحالية.</div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full min-w-[860px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
                      <th className="text-right px-4 py-3">الموظف</th>
                      <th className="text-right px-4 py-3">التاريخ</th>
                      <th className="text-right px-4 py-3">الحضور</th>
                      <th className="text-right px-4 py-3">الانصراف</th>
                      <th className="text-right px-4 py-3">ساعات العمل</th>
                      <th className="text-right px-4 py-3">ملاحظة</th>
                      <th className="text-right px-4 py-3">مصدر الرفع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceFiltered.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 text-sm">
                        <td className="px-4 py-3 font-medium text-gray-900">{r.employee.fullName}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <span dir="ltr" className="tabular-nums">
                            {formatLatinDate(r.workDate)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.checkInAt ? (
                            <span dir="ltr" className="tabular-nums">
                              {formatLatinTime(r.checkInAt)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.checkOutAt ? (
                            <span dir="ltr" className="tabular-nums">
                              {formatLatinTime(r.checkOutAt)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.workedMinutes != null ? (
                            <span dir="ltr" className="tabular-nums">
                              {(r.workedMinutes / 60).toFixed(2)} ساعة
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px]">
                          {!r.isValid ? (
                            <span className="text-rose-700">{r.validationReason ?? 'غير صالح'}</span>
                          ) : (
                            r.validationReason ?? '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{r.batch.fileName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      <Modal
        open={importRejectionsModal.open}
        onClose={() => setImportRejectionsModal((s) => ({ ...s, open: false }))}
        title={importRejectionsModal.title}
        className="max-w-2xl max-h-[85vh] flex flex-col"
      >
        <p className="text-xs text-gray-500 mb-3">
          «تنبيه» (بدل رقم صف) يعني ملاحظة على مستوى اليوم بعد تجميع البصمات، وليس صفاً من ملف Excel.
        </p>
        <div className="flex-1 overflow-auto border rounded-xl border-gray-200 max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-right px-3 py-2 w-28">المرجع</th>
                <th className="text-right px-3 py-2">السبب</th>
              </tr>
            </thead>
            <tbody>
              {importRejectionsModal.items.map((it, i) => (
                <tr key={`${it.rowNumber}-${i}`} className="border-b border-gray-50 align-top">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {it.rowNumber === 0 ? (
                      'تنبيه'
                    ) : (
                      <>
                        صف{' '}
                        <span dir="ltr" className="tabular-nums font-mono">
                          {it.rowNumber}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-800">{it.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end pt-4">
          <Button
            variant="outline"
            onClick={() => setImportRejectionsModal((s) => ({ ...s, open: false }))}
            className="min-h-[44px]"
          >
            إغلاق
          </Button>
        </div>
      </Modal>

      {/* Add employees modal */}
      <Modal
        open={addOpen && !conflictEmployee}
        onClose={() => {
          setAddOpen(false);
          setAddStep('select');
          setSelectedEmployeeIds(new Set());
          setFingerprintInputs({});
          setSelectedEmployeesSnapshot([]);
          setAddStepLoading(false);
        }}
        title={addStep === 'select' ? 'اختيار موظفين' : addStep === 'ids' ? 'معرف البصمة لكل موظف' : 'تأكيد'}
        className="max-w-2xl max-h-[85vh] flex flex-col"
      >
        {addStep === 'select' && (
          <>
            <div className="mb-4">
              <Input
                placeholder="بحث بالاسم..."
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <div className="flex-1 overflow-auto min-h-0 border rounded-xl border-gray-200 max-h-80">
              {employeesList
                .filter((e) => !alreadyOnDevice.has(e.id))
                .map((emp) => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmployeeIds.has(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      className="rounded border-gray-300 text-primary-600"
                    />
                    <span className="font-medium text-gray-900">{emp.fullName}</span>
                    <span className="text-sm text-gray-500">{emp.jobTitle}</span>
                  </label>
                ))}
            </div>
            {employeesList.filter((e) => !alreadyOnDevice.has(e.id)).length === 0 && (
              <p className="text-gray-500 py-4">لا يوجد موظفين غير مرتبطين بهذا الجهاز، أو لا توجد نتائج بحث.</p>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setAddOpen(false)} className="min-h-[44px]">
                إلغاء
              </Button>
              <Button
                onClick={() => void goToIdsStep()}
                disabled={addStepLoading}
                className="min-h-[44px]"
              >
                {addStepLoading ? 'جاري التحميل...' : 'التالي: إدخال معرف البصمة'}
              </Button>
            </div>
          </>
        )}
        {addStep === 'ids' && (
          <>
            <p className="text-sm text-gray-600 mb-4">أدخل معرف البصمة على هذا الجهاز لكل موظف. لا يُقبل تكرار المعرف على نفس الجهاز.</p>
            <div className="flex-1 overflow-auto min-h-0 border rounded-xl border-gray-200 max-h-80 space-y-2 p-2">
              {Array.from(selectedEmployeeIds).map((empId) => {
                const name =
                  selectedEmployeesSnapshot.find((s) => s.id === empId)?.fullName ??
                  employeesList.find((e) => e.id === empId)?.fullName ??
                  empId;
                return (
                  <div key={empId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium min-w-[140px]">{name}</span>
                    <Input
                      value={fingerprintInputs[empId] ?? ''}
                      onChange={(e) => setFingerprintInputs((prev) => ({ ...prev, [empId]: e.target.value }))}
                      placeholder="معرف البصمة"
                      className="max-w-[160px]"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setAddStep('select')} className="min-h-[44px]">
                رجوع
              </Button>
              <Button onClick={handleSubmitAdd} disabled={addFingerprintMutation.isPending} className="min-h-[44px]">
                {addFingerprintMutation.isPending ? 'جاري الإضافة...' : 'إضافة للجهاز'}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Conflict resolution modal */}
      <Modal
        open={!!conflictEmployee}
        onClose={() => {
          setConflictEmployee(null);
          setConflictChoice(null);
        }}
        title=""
        className="max-w-lg"
      >
        {conflictEmployee && (
          <div className="space-y-6">
            {/* توضيح الموقف */}
            <div className="flex gap-4 p-4 rounded-xl bg-amber-50 border border-amber-100">
              <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 mb-1">الموظف مرتبط بجهاز آخر</h3>
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{conflictEmployee.fullName}</span>
                  {' '}مرتبط حالياً بجهاز:{' '}
                  <span className="font-medium text-amber-800">
                    {conflictEmployee.otherDevices.map((d) => d.deviceName).join('، ')}
                  </span>
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600">اختر الإجراء المناسب:</p>

            {/* خيارات على شكل بطاقات قابلة للنقر */}
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => setConflictChoice('move')}
                className={`flex items-start gap-4 p-4 rounded-xl border-2 text-right transition-all min-h-[52px] ${
                  conflictChoice === 'move'
                    ? 'border-primary-500 bg-primary-50/50'
                    : 'border-gray-200 hover:border-primary-200 hover:bg-gray-50'
                }`}
              >
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  conflictChoice === 'move' ? 'bg-primary-100' : 'bg-gray-100'
                }`}>
                  <UserMinus className={`h-5 w-5 ${conflictChoice === 'move' ? 'text-primary-600' : 'text-gray-500'}`} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">نقله إلى هذا الجهاز فقط</p>
                  <p className="text-sm text-gray-500 mt-0.5">إزالة ربطه من الأجهزة الأخرى وربطه بهذا الجهاز فقط</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConflictChoice('add_both')}
                className={`flex items-start gap-4 p-4 rounded-xl border-2 text-right transition-all min-h-[52px] ${
                  conflictChoice === 'add_both'
                    ? 'border-primary-500 bg-primary-50/50'
                    : 'border-gray-200 hover:border-primary-200 hover:bg-gray-50'
                }`}
              >
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  conflictChoice === 'add_both' ? 'bg-primary-100' : 'bg-gray-100'
                }`}>
                  <Layers className={`h-5 w-5 ${conflictChoice === 'add_both' ? 'text-primary-600' : 'text-gray-500'}`} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">إضافته على الجهازين</p>
                  <p className="text-sm text-gray-500 mt-0.5">يبقى على الجهاز الحالي ويُضاف لهذا الجهاز أيضاً</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConflictChoice('skip')}
                className={`flex items-start gap-4 p-4 rounded-xl border-2 text-right transition-all min-h-[52px] ${
                  conflictChoice === 'skip'
                    ? 'border-gray-400 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  conflictChoice === 'skip' ? 'bg-gray-200' : 'bg-gray-100'
                }`}>
                  <Undo2 className={`h-5 w-5 ${conflictChoice === 'skip' ? 'text-gray-700' : 'text-gray-500'}`} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">تراجع</p>
                  <p className="text-sm text-gray-500 mt-0.5">إبقاؤه على الجهاز الحالي دون إضافته لهذا الجهاز</p>
                </div>
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConflictEmployee(null);
                  setConflictChoice(null);
                }}
                className="min-h-[44px]"
              >
                إلغاء
              </Button>
              <Button
                onClick={resolveConflict}
                disabled={conflictChoice === null}
                className="min-h-[44px]"
              >
                {conflictChoice === null
                  ? 'اختر خياراً'
                  : conflictChoice === 'move'
                    ? 'نقل الموظف'
                    : conflictChoice === 'add_both'
                      ? 'إضافة على الجهازين'
                      : 'تأكيد التراجع'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
