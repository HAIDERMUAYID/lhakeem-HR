/**
 * صلاحيات الواجهة — مطابقة للخادم، مع نفس التوسيع الحزمي.
 */
export const PERMISSIONS = {
  ADMIN: 'ADMIN',
  EMPLOYEES_VIEW: 'EMPLOYEES_VIEW',
  EMPLOYEES_MANAGE: 'EMPLOYEES_MANAGE',
  DEPARTMENTS_VIEW: 'DEPARTMENTS_VIEW',
  DEPARTMENTS_MANAGE: 'DEPARTMENTS_MANAGE',
  ATTENDANCE_VIEW: 'ATTENDANCE_VIEW',
  ATTENDANCE_EXPORT: 'ATTENDANCE_EXPORT',
  DEVICES_VIEW: 'DEVICES_VIEW',
  DEVICES_MANAGE: 'DEVICES_MANAGE',
  DEVICES_BIND: 'DEVICES_BIND',
  PINS_ASSIGN: 'PINS_ASSIGN',
  ABSENCES_VIEW: 'ABSENCES_VIEW',
  ABSENCES_CREATE: 'ABSENCES_CREATE',
  ABSENCES_CANCEL: 'ABSENCES_CANCEL',
  FINGERPRINT_OFFICER: 'FINGERPRINT_OFFICER',
  FINGERPRINT_MANAGER: 'FINGERPRINT_MANAGER',
  LEAVES_VIEW: 'LEAVES_VIEW',
  LEAVES_CREATE: 'LEAVES_CREATE',
  LEAVES_APPROVE: 'LEAVES_APPROVE',
  LEAVES_PRINT: 'LEAVES_PRINT',
  LEAVE_TYPES_MANAGE: 'LEAVE_TYPES_MANAGE',
  HOLIDAYS_VIEW: 'HOLIDAYS_VIEW',
  HOLIDAYS_MANAGE: 'HOLIDAYS_MANAGE',
  SCHEDULES_VIEW: 'SCHEDULES_VIEW',
  SCHEDULES_MANAGE: 'SCHEDULES_MANAGE',
  SCHEDULES_APPROVE: 'SCHEDULES_APPROVE',
  REPORTS_VIEW: 'REPORTS_VIEW',
  REPORTS_EXPORT: 'REPORTS_EXPORT',
  USERS_MANAGE: 'USERS_MANAGE',
  AUDIT_VIEW: 'AUDIT_VIEW',
  SETTINGS_VIEW: 'SETTINGS_VIEW',
  SETTINGS_MANAGE: 'SETTINGS_MANAGE',
  BALANCE_ACCRUAL: 'BALANCE_ACCRUAL',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const IMPLIES: Record<string, string[]> = {
  FINGERPRINT_OFFICER: [
    'ATTENDANCE_VIEW',
    'ATTENDANCE_EXPORT',
    'DEVICES_VIEW',
    'DEVICES_MANAGE',
    'DEVICES_BIND',
    'PINS_ASSIGN',
    'ABSENCES_VIEW',
    'ABSENCES_CREATE',
    'ABSENCES_CANCEL',
  ],
  FINGERPRINT_MANAGER: [
    'FINGERPRINT_OFFICER',
    'ATTENDANCE_VIEW',
    'ATTENDANCE_EXPORT',
    'DEVICES_VIEW',
    'DEVICES_MANAGE',
    'DEVICES_BIND',
    'PINS_ASSIGN',
    'ABSENCES_VIEW',
    'ABSENCES_CREATE',
    'ABSENCES_CANCEL',
  ],
  EMPLOYEES_MANAGE: ['EMPLOYEES_VIEW'],
  DEPARTMENTS_MANAGE: ['DEPARTMENTS_VIEW'],
  ATTENDANCE_EXPORT: ['ATTENDANCE_VIEW'],
  DEVICES_MANAGE: ['DEVICES_VIEW'],
  DEVICES_BIND: ['DEVICES_VIEW'],
  PINS_ASSIGN: ['ATTENDANCE_VIEW', 'DEVICES_VIEW'],
  ABSENCES_CREATE: ['ABSENCES_VIEW'],
  ABSENCES_CANCEL: ['ABSENCES_VIEW'],
  LEAVES_APPROVE: ['LEAVES_VIEW'],
  LEAVES_PRINT: ['LEAVES_VIEW'],
  LEAVES_CREATE: ['LEAVES_VIEW'],
  REPORTS_EXPORT: ['REPORTS_VIEW'],
  SCHEDULES_MANAGE: ['SCHEDULES_VIEW'],
  SCHEDULES_APPROVE: ['SCHEDULES_VIEW'],
  HOLIDAYS_MANAGE: ['HOLIDAYS_VIEW', 'LEAVES_VIEW'],
  SETTINGS_MANAGE: ['SETTINGS_VIEW'],
};

export function expandPermissions(codes: string[] | undefined | null): Set<string> {
  const out = new Set<string>();
  const visit = (code: string) => {
    if (out.has(code)) return;
    out.add(code);
    for (const next of IMPLIES[code] ?? []) visit(next);
  };
  for (const code of codes ?? []) visit(code);
  return out;
}

export function hasAnyPermission(
  userPermissions: string[] | undefined | null,
  required: string | string[] | readonly string[],
): boolean {
  if (!userPermissions?.length) return false;
  if (userPermissions.includes(PERMISSIONS.ADMIN)) return true;
  const expanded = expandPermissions(userPermissions);
  const list = (Array.isArray(required) ? [...required] : [required]) as string[];
  return list.some((code) => expanded.has(code));
}
