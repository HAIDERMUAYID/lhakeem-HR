'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/shared/empty-state';

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

  const goToIdsStep = () => {
    if (selectedEmployeeIds.size === 0) {
      toast.error('اختر موظفاً واحداً على الأقل');
      return;
    }
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

    for (const empId of list) {
      const fid = (fingerprintInputs[empId] ?? '').trim();
      if (!fid) {
        const emp = employeesList.find((e) => e.id === empId);
        errors.push(emp ? `معرف البصمة مطلوب لـ ${emp.fullName}` : 'معرف البصمة مطلوب');
        continue;
      }
      if (usedIds.has(fid)) {
        const emp = employeesList.find((e) => e.id === empId);
        errors.push(emp ? `معرف البصمة "${fid}" مستخدم على هذا الجهاز (${emp.fullName})` : `معرف "${fid}" مكرر`);
        continue;
      }

      const existing = await getEmployeeFingerprints(empId);
      const onOtherDevices = existing.filter((r) => r.deviceId !== deviceId);

      if (onOtherDevices.length > 0) {
        const emp = employeesList.find((e) => e.id === empId);
        setConflictEmployee({
          employeeId: empId,
          fullName: emp?.fullName ?? 'موظف',
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
      const names = missing.map((eid) => employeesList.find((e) => e.id === eid)?.fullName ?? eid).join(', ');
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

  const fingerprints = device?.fingerprints ?? [];
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
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
          <Button onClick={() => setAddOpen(true)} className="gap-2 shadow-md min-h-[44px]">
            <Plus className="h-5 w-5" />
            إضافة موظفين
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-0">
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
              description="أضف موظفين وحدد معرف البصمة لكل منهم على هذا الجهاز"
              actionLabel="إضافة موظفين"
              actionIcon={Plus}
              onAction={() => setAddOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">الموظف</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">الوظيفة</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">معرف البصمة</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-600 w-32">إجراءات</th>
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

      {/* Add employees modal */}
      <Modal
        open={addOpen && !conflictEmployee}
        onClose={() => {
          setAddOpen(false);
          setAddStep('select');
          setSelectedEmployeeIds(new Set());
          setFingerprintInputs({});
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
              <Button onClick={goToIdsStep} className="min-h-[44px]">
                التالي: إدخال معرف البصمة
              </Button>
            </div>
          </>
        )}
        {addStep === 'ids' && (
          <>
            <p className="text-sm text-gray-600 mb-4">أدخل معرف البصمة على هذا الجهاز لكل موظف. لا يُقبل تكرار المعرف على نفس الجهاز.</p>
            <div className="flex-1 overflow-auto min-h-0 border rounded-xl border-gray-200 max-h-80 space-y-2 p-2">
              {Array.from(selectedEmployeeIds).map((empId) => {
                const emp = employeesList.find((e) => e.id === empId);
                return (
                  <div key={empId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium min-w-[140px]">{emp?.fullName ?? empId}</span>
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
