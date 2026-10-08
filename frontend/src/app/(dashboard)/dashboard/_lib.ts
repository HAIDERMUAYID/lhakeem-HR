import { hospitalDateKey } from '@/lib/hospital-clock';

export type LeaveRow = {
  id: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  hoursCount?: number | null;
  status: string;
  reason: string | null;
  employee: {
    id: string;
    fullName: string;
    leaveBalance: string | number;
    department?: { name: string } | null;
    unit?: { name: string } | null;
  };
  leaveType: { id: string; nameAr: string };
};

export type EmployeeRow = {
  id: string;
  fullName: string;
  jobTitle: string;
  workType: string;
  isActive: boolean;
  leaveBalance: string | number;
  department: { id: string; name: string };
  unit?: { id: string; name: string } | null;
};

export type DepartmentRow = {
  id: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
  _count?: { employees: number };
  managerUser?: { id: string; name: string } | null;
};

export function formatArDate(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-IQ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Baghdad',
  });
}

export function formatArLongDate(iso?: Date) {
  const d = iso ?? new Date();
  return d.toLocaleDateString('ar-IQ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Baghdad',
  });
}

export function toDateInput(iso: string) {
  return hospitalDateKey(iso);
}

export function workTypeLabel(workType: string) {
  return workType === 'SHIFTS' ? 'خفارات' : 'صباحي';
}

export function leaveDuration(daysCount: number, hoursCount?: number | null) {
  const hours = hoursCount != null ? Number(hoursCount) : daysCount * 7;
  const wholeDays = Math.abs(hours - daysCount * 7) < 0.01 && daysCount >= 1;
  if (wholeDays) return daysCount === 1 ? 'يوم واحد' : `${daysCount} أيام`;
  return `${hours} ساعة`;
}
