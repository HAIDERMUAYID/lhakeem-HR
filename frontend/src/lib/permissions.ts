/**
 * صلاحيات الواجهة - مطابقة لـ backend (أي صلاحية تكفي للوصول)
 */
export const PERMISSIONS = {
  ADMIN: 'ADMIN',
  EMPLOYEES_VIEW: 'EMPLOYEES_VIEW',
  EMPLOYEES_MANAGE: 'EMPLOYEES_MANAGE',
  DEPARTMENTS_MANAGE: 'DEPARTMENTS_MANAGE',
  LEAVES_VIEW: 'LEAVES_VIEW',
  LEAVES_CREATE: 'LEAVES_CREATE',
  LEAVES_APPROVE: 'LEAVES_APPROVE',
  LEAVES_PRINT: 'LEAVES_PRINT',
  LEAVE_TYPES_MANAGE: 'LEAVE_TYPES_MANAGE',
  REPORTS_EXPORT: 'REPORTS_EXPORT',
  FINGERPRINT_OFFICER: 'FINGERPRINT_OFFICER',
  FINGERPRINT_MANAGER: 'FINGERPRINT_MANAGER',
  HOLIDAYS_VIEW: 'HOLIDAYS_VIEW',
  HOLIDAYS_MANAGE: 'HOLIDAYS_MANAGE',
  REPORTS_VIEW: 'REPORTS_VIEW',
  SETTINGS_VIEW: 'SETTINGS_VIEW',
  SCHEDULES_VIEW: 'SCHEDULES_VIEW',
  SCHEDULES_MANAGE: 'SCHEDULES_MANAGE',
  SCHEDULES_APPROVE: 'SCHEDULES_APPROVE',
  USERS_MANAGE: 'USERS_MANAGE',
  AUDIT_VIEW: 'AUDIT_VIEW',
  BALANCE_ACCRUAL: 'BALANCE_ACCRUAL',
  ABSENCES_CREATE: 'ABSENCES_CREATE',
  ABSENCES_CANCEL: 'ABSENCES_CANCEL',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** التحقق من وجود أي صلاحية من القائمة (أو ADMIN) */
export function hasAnyPermission(
  userPermissions: string[] | undefined | null,
  required: string | string[] | readonly string[]
): boolean {
  if (!userPermissions?.length) return false;
  if (userPermissions.includes(PERMISSIONS.ADMIN)) return true;
  const list = (Array.isArray(required) ? [...required] : [required]) as string[];
  return list.some((p) => userPermissions.includes(p));
}
