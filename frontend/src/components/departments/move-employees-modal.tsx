'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Building2, Layers3 } from 'lucide-react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { apiGet, apiPost } from '@/lib/api';

type DepartmentOption = { id: string; name: string; isActive?: boolean };
type UnitOption = { id: string; name: string; isActive?: boolean };

export function MoveEmployeesModal(props: {
  open: boolean;
  onClose: () => void;
  employeeIds: string[];
  defaultDepartmentId?: string | null;
  onMoved?: () => void;
}) {
  const { open, onClose, employeeIds, defaultDepartmentId, onMoved } = props;
  const queryClient = useQueryClient();

  const [targetDeptId, setTargetDeptId] = useState<string>('');
  const [targetUnitId, setTargetUnitId] = useState<string>(''); // '' => بدون وحدة

  useEffect(() => {
    if (!open) return;
    setTargetDeptId(defaultDepartmentId ?? '');
    setTargetUnitId('');
  }, [open, defaultDepartmentId]);

  const { data: departments } = useQuery({
    queryKey: ['departments-options', 'active'],
    queryFn: () => apiGet<DepartmentOption[]>(`/api/departments?activeOnly=true`),
    enabled: open,
  });

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units-options', targetDeptId],
    queryFn: () => apiGet<UnitOption[]>(`/api/departments/${targetDeptId}/units?activeOnly=true`),
    enabled: open && !!targetDeptId,
  });

  const deptOptions = useMemo(
    () => (departments ?? []).map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const unitOptions = useMemo(() => {
    const list = units ?? [];
    return [
      { value: '', label: 'بدون وحدة' },
      ...list.map((u) => ({ value: u.id, label: u.name })),
    ];
  }, [units]);

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!employeeIds.length) throw new Error('لم يتم اختيار موظفين');
      if (!targetDeptId) throw new Error('يجب اختيار القسم الهدف');
      return apiPost(`/api/employees/move`, {
        employeeIds,
        targetDepartmentId: targetDeptId,
        targetUnitId: targetUnitId || null,
      });
    },
    onSuccess: async () => {
      // إعادة تحميل الصفحات ذات الصلة
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['department-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['unit-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['employees'] }),
      ]);
      onMoved?.();
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="نقل موظفين" className="max-w-lg">
      <div className="mb-4 rounded-xl border border-gray-100 bg-gradient-to-l from-gray-50 to-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <ArrowRightLeft className="h-4 w-4 text-primary-700" />
            <span>سيتم نقل</span>
            <Badge variant="secondary">{employeeIds.length}</Badge>
            <span>موظف</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">اختر القسم الهدف ثم الوحدة (اختياري). إذا اخترت “بدون وحدة” سيتم وضع الموظف داخل القسم مباشرة.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">القسم الهدف</label>
          <Select
            value={targetDeptId}
            onChange={(v) => {
              setTargetDeptId(v);
              setTargetUnitId('');
            }}
            options={deptOptions}
            placeholder="اختر قسماً"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">الوحدة (اختياري)</label>
          <Select
            value={targetUnitId}
            onChange={(v) => setTargetUnitId(v)}
            options={unitOptions}
            disabled={!targetDeptId || unitsLoading}
            placeholder="بدون وحدة"
          />
          {!targetDeptId && (
            <p className="text-xs text-gray-400 mt-1">اختر القسم أولاً لإظهار الوحدات.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={moveMutation.isPending}>
            إلغاء
          </Button>
          <Button
            onClick={() => moveMutation.mutate()}
            className="gap-2"
            disabled={moveMutation.isPending || !employeeIds.length || !targetDeptId}
          >
            <Building2 className="h-4 w-4" />
            نقل إلى قسم/وحدة
            <Layers3 className="h-4 w-4" />
          </Button>
        </div>

        {moveMutation.isError && (
          <p className="text-sm text-red-600">{(moveMutation.error as Error)?.message ?? 'حدث خطأ'}</p>
        )}
      </div>
    </Modal>
  );
}

