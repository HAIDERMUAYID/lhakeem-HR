/**
 * خريطة مسارات لوحة التحكم → الصلاحية المطلوبة للوصول (أي صلاحية من القائمة تكفي)
 * Deny by Default: أي مسار غير مذكور أو بدون صلاحية = يحتاج عدم وجود صلاحية (مثل لوحة التحكم الرئيسية)
 */
import { PERMISSIONS } from './permissions';

export type RoutePermission = string | string[] | null;

/** مسارات لا تحتاج صلاحية محددة (أي مستخدم مسجل دخوله يمكنه الوصول) */
const PUBLIC_DASHBOARD_PATHS = ['/dashboard', '/dashboard/'];

/**
 * قواعد المسارات: إما مسار كامل أو بادئة أطول تُطابق أولاً.
 * القيمة: null = متاح للجميع، string = صلاحية واحدة، string[] = أي صلاحية من القائمة
 */
const ROUTE_PERMISSION_MAP: { path: string; permission: RoutePermission }[] = [
  { path: '/dashboard/employees', permission: PERMISSIONS.EMPLOYEES_VIEW },
  { path: '/dashboard/data-completion', permission: PERMISSIONS.EMPLOYEES_VIEW },
  { path: '/dashboard/imports', permission: PERMISSIONS.EMPLOYEES_MANAGE },
  { path: '/dashboard/departments', permission: PERMISSIONS.DEPARTMENTS_MANAGE },
  { path: '/dashboard/devices', permission: [PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER, PERMISSIONS.DEPARTMENTS_MANAGE] },
  { path: '/dashboard/fingerprint-calendar', permission: [PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER, PERMISSIONS.DEPARTMENTS_MANAGE] },
  { path: '/dashboard/leaves', permission: PERMISSIONS.LEAVES_VIEW },
  { path: '/dashboard/leave-types', permission: PERMISSIONS.LEAVE_TYPES_MANAGE },
  { path: '/dashboard/absences', permission: [PERMISSIONS.FINGERPRINT_OFFICER, PERMISSIONS.FINGERPRINT_MANAGER] },
  { path: '/dashboard/holidays', permission: [PERMISSIONS.LEAVES_VIEW, PERMISSIONS.HOLIDAYS_VIEW] },
  { path: '/dashboard/schedules', permission: PERMISSIONS.SCHEDULES_VIEW },
  { path: '/dashboard/reports', permission: PERMISSIONS.REPORTS_VIEW },
  { path: '/dashboard/settings', permission: PERMISSIONS.SETTINGS_VIEW },
  { path: '/dashboard/change-password', permission: null },
  { path: '/dashboard/users', permission: PERMISSIONS.USERS_MANAGE },
  { path: '/dashboard/audit-logs', permission: PERMISSIONS.AUDIT_VIEW },
];

function normalizePath(pathname: string): string {
  const p = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  return p || '/';
}

/**
 * يُرجع الصلاحية المطلوبة للمسار الحالي (أطول تطابق).
 * المسارات الفرعية (مثل /dashboard/leaves/calendar) تُطابق بادئة /dashboard/leaves.
 */
export function getRequiredPermissionForPath(pathname: string): RoutePermission {
  const normalized = normalizePath(pathname);
  if (PUBLIC_DASHBOARD_PATHS.some((p) => normalized === p || normalized === '/dashboard')) {
    return null;
  }
  const sorted = [...ROUTE_PERMISSION_MAP].sort((a, b) => b.path.length - a.path.length);
  for (const { path, permission } of sorted) {
    if (normalized === path || normalized.startsWith(path + '/')) {
      return permission;
    }
  }
  return null;
}

/**
 * التحقق من أن المستخدم لديه صلاحية الوصول للمسار الحالي
 */
export function canAccessPath(
  pathname: string,
  userPermissions: string[] | undefined | null
): boolean {
  const required = getRequiredPermissionForPath(pathname);
  if (required === null) return true;
  if (!userPermissions?.length) return false;
  if (userPermissions.includes(PERMISSIONS.ADMIN)) return true;
  const list = Array.isArray(required) ? required : [required];
  return list.some((p) => userPermissions.includes(p));
}
