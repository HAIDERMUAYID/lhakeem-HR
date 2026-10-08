import { hasAnyPermission, PERMISSIONS } from './permissions';

export type RoutePermission = string | string[] | null;

const PUBLIC_DASHBOARD_PATHS = ['/dashboard', '/dashboard/'];

const ROUTE_PERMISSION_MAP: { path: string; permission: RoutePermission }[] = [
  { path: '/dashboard/employees', permission: PERMISSIONS.EMPLOYEES_VIEW },
  { path: '/dashboard/data-completion', permission: PERMISSIONS.EMPLOYEES_VIEW },
  { path: '/dashboard/imports', permission: PERMISSIONS.EMPLOYEES_MANAGE },
  { path: '/dashboard/departments', permission: PERMISSIONS.DEPARTMENTS_VIEW },
  { path: '/dashboard/devices', permission: PERMISSIONS.DEVICES_VIEW },
  { path: '/dashboard/attendance', permission: PERMISSIONS.ATTENDANCE_VIEW },
  { path: '/dashboard/fingerprint-calendar', permission: PERMISSIONS.ATTENDANCE_VIEW },
  { path: '/dashboard/leaves', permission: PERMISSIONS.LEAVES_VIEW },
  { path: '/dashboard/leave-types', permission: PERMISSIONS.LEAVE_TYPES_MANAGE },
  { path: '/dashboard/absences', permission: PERMISSIONS.ABSENCES_VIEW },
  { path: '/dashboard/holidays', permission: [PERMISSIONS.HOLIDAYS_VIEW, PERMISSIONS.LEAVES_VIEW] },
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

export function canAccessPath(pathname: string, userPermissions: string[] | undefined | null): boolean {
  const required = getRequiredPermissionForPath(pathname);
  if (required === null) return true;
  return hasAnyPermission(userPermissions, required);
}
