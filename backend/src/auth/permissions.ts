/**
 * صلاحيات النظام — كل صفحة وإجراء مربوط برمز واضح.
 * ADMIN يغطي الكل. الصلاحيات الحزمية (مثل موظف البصمة) تمنح ما تحتها تلقائياً.
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

export const PERMISSION_LABELS: Record<string, string> = {
  ADMIN: 'صلاحية كاملة لكل النظام',
  EMPLOYEES_VIEW: 'عرض الموظفين',
  EMPLOYEES_MANAGE: 'إضافة وتعديل الموظفين والاستيراد',
  DEPARTMENTS_VIEW: 'عرض الأقسام والوحدات',
  DEPARTMENTS_MANAGE: 'إدارة الأقسام والوحدات',
  ATTENDANCE_VIEW: 'عرض كشف الحضور والانصراف',
  ATTENDANCE_EXPORT: 'طباعة وتصدير كشف الحضور',
  DEVICES_VIEW: 'عرض أجهزة البصمة',
  DEVICES_MANAGE: 'إضافة وتعديل وحذف أجهزة البصمة',
  DEVICES_BIND: 'ربط الجهاز بالقسم أو الرقم التسلسلي',
  PINS_ASSIGN: 'تعريف معرفات البصمة وربطها بالموظفين',
  ABSENCES_VIEW: 'عرض الغيابات وكشوفها',
  ABSENCES_CREATE: 'تسجيل الغياب',
  ABSENCES_CANCEL: 'إلغاء الغياب',
  FINGERPRINT_OFFICER: 'موظف بصمة (حزمة عمل يومي)',
  FINGERPRINT_MANAGER: 'مدير البصمة (مصادقة الكشوف)',
  LEAVES_VIEW: 'عرض الإجازات والتقويم',
  LEAVES_CREATE: 'إنشاء طلب إجازة',
  LEAVES_APPROVE: 'اعتماد أو رفض الإجازات',
  LEAVES_PRINT: 'طباعة تقرير الإجازات',
  LEAVE_TYPES_MANAGE: 'إدارة أنواع الإجازات',
  HOLIDAYS_VIEW: 'عرض العطل',
  HOLIDAYS_MANAGE: 'إدارة العطل',
  SCHEDULES_VIEW: 'عرض جداول الدوام',
  SCHEDULES_MANAGE: 'إدارة جداول الدوام',
  SCHEDULES_APPROVE: 'مصادقة جداول الدوام',
  REPORTS_VIEW: 'عرض التقارير',
  REPORTS_EXPORT: 'تصدير التقارير',
  USERS_MANAGE: 'إدارة المستخدمين وصلاحياتهم',
  AUDIT_VIEW: 'عرض سجل التدقيق',
  SETTINGS_VIEW: 'عرض الإعدادات',
  SETTINGS_MANAGE: 'تعديل الإعدادات',
  BALANCE_ACCRUAL: 'تشغيل استحقاق الرصيد الشهري',
};

/** عند منح صلاحية أعلى تُطلب أيضاً صلاحيات العرض التابعة لها في واجهة الإدارة */
export const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  EMPLOYEES_MANAGE: ['EMPLOYEES_VIEW'],
  DEPARTMENTS_MANAGE: ['DEPARTMENTS_VIEW'],
  ATTENDANCE_EXPORT: ['ATTENDANCE_VIEW'],
  DEVICES_MANAGE: ['DEVICES_VIEW'],
  DEVICES_BIND: ['DEVICES_VIEW'],
  PINS_ASSIGN: ['ATTENDANCE_VIEW', 'DEVICES_VIEW'],
  ABSENCES_CREATE: ['ABSENCES_VIEW'],
  ABSENCES_CANCEL: ['ABSENCES_VIEW'],
  FINGERPRINT_MANAGER: ['FINGERPRINT_OFFICER'],
  LEAVES_APPROVE: ['LEAVES_VIEW'],
  LEAVES_PRINT: ['LEAVES_VIEW'],
  LEAVES_CREATE: ['LEAVES_VIEW'],
  REPORTS_EXPORT: ['REPORTS_VIEW'],
  SCHEDULES_MANAGE: ['SCHEDULES_VIEW'],
  SCHEDULES_APPROVE: ['SCHEDULES_VIEW'],
  HOLIDAYS_MANAGE: ['HOLIDAYS_VIEW'],
  SETTINGS_MANAGE: ['SETTINGS_VIEW'],
};

/**
 * ما تمنحه الصلاحية فعلياً في التحقق.
 * موظف البصمة الحالي يبقى قادراً على الحضور والأجهزة والغيابات دون إعادة منحه يدوياً.
 */
export const PERMISSION_IMPLIES: Record<string, string[]> = {
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

export const PERMISSION_MODULES: Record<string, string[]> = {
  الموظفون: ['EMPLOYEES_VIEW', 'EMPLOYEES_MANAGE'],
  الأقسام: ['DEPARTMENTS_VIEW', 'DEPARTMENTS_MANAGE'],
  'الحضور والانصراف': ['ATTENDANCE_VIEW', 'ATTENDANCE_EXPORT'],
  'أجهزة البصمة': ['DEVICES_VIEW', 'DEVICES_MANAGE', 'DEVICES_BIND', 'PINS_ASSIGN'],
  الغيابات: ['ABSENCES_VIEW', 'ABSENCES_CREATE', 'ABSENCES_CANCEL', 'FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER'],
  الإجازات: ['LEAVES_VIEW', 'LEAVES_CREATE', 'LEAVES_APPROVE', 'LEAVES_PRINT', 'LEAVE_TYPES_MANAGE'],
  العطل: ['HOLIDAYS_VIEW', 'HOLIDAYS_MANAGE'],
  'جداول الدوام': ['SCHEDULES_VIEW', 'SCHEDULES_MANAGE', 'SCHEDULES_APPROVE'],
  التقارير: ['REPORTS_VIEW', 'REPORTS_EXPORT'],
  النظام: ['USERS_MANAGE', 'AUDIT_VIEW', 'SETTINGS_VIEW', 'SETTINGS_MANAGE', 'BALANCE_ACCRUAL', 'ADMIN'],
};

export const PERMISSION_PRESETS: Array<{ id: string; label: string; permissions: string[] }> = [
  { id: 'attendance-view', label: 'عرض الحضور فقط', permissions: ['ATTENDANCE_VIEW'] },
  { id: 'attendance-print', label: 'عرض وطباعة الحضور', permissions: ['ATTENDANCE_VIEW', 'ATTENDANCE_EXPORT'] },
  { id: 'fingerprint-officer', label: 'موظف بصمة', permissions: ['FINGERPRINT_OFFICER'] },
  { id: 'fingerprint-manager', label: 'مدير البصمة', permissions: ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER'] },
  { id: 'leave-officer', label: 'موظف إجازات', permissions: ['LEAVES_VIEW', 'LEAVES_CREATE'] },
  { id: 'leave-manager', label: 'مدير إجازات', permissions: ['LEAVES_VIEW', 'LEAVES_CREATE', 'LEAVES_APPROVE', 'LEAVES_PRINT', 'HOLIDAYS_VIEW'] },
  { id: 'hr-view', label: 'عرض الموارد البشرية', permissions: ['EMPLOYEES_VIEW', 'DEPARTMENTS_VIEW', 'LEAVES_VIEW', 'ATTENDANCE_VIEW', 'REPORTS_VIEW'] },
];

export function expandPermissions(codes: string[] | undefined | null): Set<string> {
  const out = new Set<string>();
  const visit = (code: string) => {
    if (out.has(code)) return;
    out.add(code);
    for (const next of PERMISSION_IMPLIES[code] ?? []) visit(next);
  };
  for (const code of codes ?? []) visit(code);
  return out;
}

export function hasPermission(userPermissions: string[] | undefined | null, required: string | string[]): boolean {
  if (!userPermissions?.length) return false;
  if (userPermissions.includes(PERMISSIONS.ADMIN)) return true;
  const expanded = expandPermissions(userPermissions);
  const list = Array.isArray(required) ? required : [required];
  return list.some((code) => expanded.has(code));
}
