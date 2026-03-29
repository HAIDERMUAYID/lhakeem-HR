'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronLeft, Fingerprint, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

type DeviceRow = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  _count: { fingerprints: number };
};

type DeviceDetail = {
  id: string;
  name: string;
  fingerprints: { fingerprintId: string; employeeId: string }[];
};

export type DeptEmployeeRow = {
  id: string;
  fullName: string;
  jobTitle: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  departmentName: string;
  employees: DeptEmployeeRow[];
};

export function DepartmentFingerprintMigrateModal({
  open,
  onClose,
  departmentId,
  departmentName,
  employees,
}: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'select' | 'ids' | 'result'>('select');
  const [deviceId, setDeviceId] = useState('');
  const [migrateSearch, setMigrateSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [fpInputs, setFpInputs] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<{ id: string; fullName: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: number; failures: { name: string; reason: string }[] } | null>(null);

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', 'dept-migrate'],
    queryFn: () => apiGet<DeviceRow[]>('/api/devices?activeOnly=true'),
    enabled: open,
  });

  const { data: deviceDetail, isLoading: deviceLoading } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => apiGet<DeviceDetail>(`/api/devices/${deviceId}`),
    enabled: open && !!deviceId,
  });

  const deviceOptions = useMemo(
    () =>
      devices
        .filter((d) => d.isActive)
        .map((d) => ({
          value: d.id,
          label: d.code ? `${d.name} (${d.code})` : d.name,
        })),
    [devices],
  );

  const filtered = useMemo(() => {
    const q = migrateSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        (e.jobTitle ?? '').toLowerCase().includes(q),
    );
  }, [employees, migrateSearch]);

  const selectedIds = useMemo(() => Object.keys(selected), [selected]);

  useEffect(() => {
    if (!open) return;
    setStep('select');
    setDeviceId('');
    setMigrateSearch('');
    setSelected({});
    setFpInputs({});
    setSnapshot([]);
    setResult(null);
    setPending(false);
  }, [open]);

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected({});
      return;
    }
    const next: Record<string, true> = {};
    for (const e of filtered) next[e.id] = true;
    setSelected(next);
  };

  const goToIds = () => {
    if (!deviceId) {
      toast.error('اختر جهاز البصمة');
      return;
    }
    if (selectedIds.length === 0) {
      toast.error('اختر موظفاً واحداً على الأقل');
      return;
    }
    setSnapshot(
      selectedIds.map((id) => {
        const e = employees.find((x) => x.id === id);
        return { id, fullName: e?.fullName ?? id };
      }),
    );
    setFpInputs({});
    setStep('ids');
  };

  const getName = (id: string) => snapshot.find((s) => s.id === id)?.fullName ?? id;

  const runMigrate = async () => {
    if (!deviceId || !deviceDetail) {
      toast.error('لم يتم تحميل بيانات الجهاز');
      return;
    }
    const list = selectedIds;
    const missing = list.filter((id) => !(fpInputs[id] ?? '').trim());
    if (missing.length > 0) {
      const names = missing.map(getName).join('، ');
      toast.error(`أدخل معرف البصمة للموظفين: ${names}`);
      return;
    }

    setPending(true);
    const failures: { name: string; reason: string }[] = [];
    let ok = 0;
    const usedIds = new Set((deviceDetail.fingerprints ?? []).map((f) => f.fingerprintId));

    for (const empId of list) {
      const fid = (fpInputs[empId] ?? '').trim();
      if (!fid) {
        failures.push({ name: getName(empId), reason: 'معرف البصمة فارغ' });
        continue;
      }
      if (usedIds.has(fid)) {
        failures.push({
          name: getName(empId),
          reason: `معرف «${fid}» مستخدم مسبقاً على هذا الجهاز أو مُدخل لأكثر من موظف في هذه الدفعة`,
        });
        continue;
      }

      try {
        await apiPost(`/api/employees/${empId}/fingerprints`, { deviceId, fingerprintId: fid });
        usedIds.add(fid);
        ok++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('مسجّل بالفعل')) {
          usedIds.add(fid);
          ok++;
        } else {
          failures.push({ name: getName(empId), reason: msg });
        }
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
    await queryClient.invalidateQueries({ queryKey: ['devices'] });
    await queryClient.invalidateQueries({ queryKey: ['department-detail', departmentId] });

    setPending(false);
    setResult({ ok, failures });
    setStep('result');

    if (ok > 0) {
      toast.success(
        failures.length === 0
          ? `تم ترحيل ${ok} موظفاً بنجاح على الجهاز`
          : `تم ترحيل ${ok} موظفاً بنجاح. لم يُرحَّل ${failures.length} موظفاً (راجع التفاصيل).`,
      );
    }
    if (ok === 0 && failures.length > 0) {
      toast.error('لم يُرحَّل أي موظف. راجع أسباب الفشل أدناه.');
    }
  };

  const title =
    step === 'select'
      ? `ترحيل موظفي «${departmentName}» إلى جهاز بصمة`
      : step === 'ids'
        ? 'معرف البصمة لكل موظف'
        : 'نتيجة الترحيل';

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-lg">
      {step === 'select' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            اختر جهاز الحضور ثم الموظفين المراد ربطهم. في الخطوة التالية تُدخل معرف البصمة كما على الجهاز (بدون تكرار لنفس
            المعرف على نفس الجهاز).
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">جهاز البصمة *</label>
            <Select
              value={deviceId}
              onChange={(v) => setDeviceId(v)}
              options={deviceOptions}
              placeholder={deviceLoading ? 'جاري التحميل...' : 'اختر الجهاز'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">بحث في الموظفين</label>
            <Input
              value={migrateSearch}
              onChange={(e) => setMigrateSearch(e.target.value)}
              placeholder="الاسم أو المسمى الوظيفي..."
              className="bg-white"
            />
          </div>
          <div className="rounded-xl border border-gray-100 max-h-[min(50vh,360px)] overflow-y-auto">
            <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 px-3 py-2 bg-gray-50/95 border-b border-gray-100 text-sm">
              <span className="text-gray-600">
                {selectedIds.length} / {filtered.length} محدد
              </span>
              <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => toggleAll(true)}>
                تحديد الكل (الظاهر)
              </Button>
            </div>
            <ul className="divide-y divide-gray-50">
              {filtered.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50/80">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={!!selected[e.id]}
                    onChange={(ev) =>
                      setSelected((prev) => {
                        const next = { ...prev };
                        if (ev.target.checked) next[e.id] = true;
                        else delete next[e.id];
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{e.fullName}</p>
                    <p className="text-xs text-gray-500">{e.jobTitle}</p>
                  </div>
                </li>
              ))}
            </ul>
            {filtered.length === 0 && (
              <p className="p-4 text-center text-sm text-gray-500">لا يوجد موظفون مطابقون للبحث</p>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
              إلغاء
            </Button>
            <Button type="button" onClick={goToIds} disabled={!deviceId || selectedIds.length === 0} className="gap-2 min-h-[44px]">
              التالي: إدخال معرفات البصمة
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 'ids' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            أدخل معرف البصمة على الجهاز <span className="font-medium text-gray-800">{deviceDetail?.name ?? '…'}</span> لكل
            موظف. عند الترحيل يُعالَج كل موظف على حدة؛ إن تعذّر قبول معرف (مثل التكرار على نفس الجهاز) يُكمَل ترحيل البقية
            وتُعرض أسباب الفشل.
          </p>
          <div className="rounded-xl border border-gray-100 max-h-[min(55vh,420px)] overflow-y-auto divide-y divide-gray-50">
            {snapshot.map((s) => (
              <div key={s.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 text-sm">{s.fullName}</p>
                </div>
                <Input
                  dir="ltr"
                  className="font-mono sm:max-w-[140px]"
                  placeholder="معرف البصمة"
                  value={fpInputs[s.id] ?? ''}
                  onChange={(e) => setFpInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between pt-2">
            <Button type="button" variant="ghost" onClick={() => setStep('select')} className="min-h-[44px]">
              رجوع للاختيار
            </Button>
            <div className="flex gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
                إلغاء
              </Button>
              <Button
                type="button"
                onClick={runMigrate}
                disabled={pending || deviceLoading || !deviceDetail}
                className="gap-2 min-h-[44px]"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري الترحيل...
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4" />
                    ترحيل
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4">
          {result.ok > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-emerald-900">تم ترحيل {result.ok} موظفاً بنجاح</p>
                {deviceId && (
                  <Link
                    href={`/dashboard/devices/${deviceId}`}
                    className="text-sm text-emerald-800 underline underline-offset-2 mt-1 inline-flex items-center gap-1"
                  >
                    عرض موظفي الجهاز
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          )}

          {result.failures.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-100 bg-amber-100/50">
                <AlertCircle className="h-4 w-4 text-amber-800 shrink-0" />
                <span className="text-sm font-medium text-amber-950">
                  لم يُرحَّل {result.failures.length} موظفاً
                </span>
              </div>
              <ul className="max-h-[min(40vh,280px)] overflow-y-auto divide-y divide-amber-100/80">
                {result.failures.map((f, i) => (
                  <li key={i} className="px-3 py-2.5 text-sm">
                    <span className="font-medium text-gray-900">{f.name}</span>
                    <span className="text-gray-500"> — </span>
                    <span className="text-amber-950/90">{f.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={onClose} className="min-h-[44px]">
              إغلاق
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
