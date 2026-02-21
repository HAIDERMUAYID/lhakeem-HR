/**
 * صلاحيات النظام - تُعطى لكل مستخدم بشكل فردي
 */
export const PERMISSIONS = {
  LEAVES_APPROVE: 'LEAVES_APPROVE',       // اعتماد/رفض الإجازات
  ABSENCES_CREATE: 'ABSENCES_CREATE',     // تسجيل الغياب (مباشر - قديم)
  ABSENCES_CANCEL: 'ABSENCES_CANCEL',     // إلغاء الغياب
  AUDIT_VIEW: 'AUDIT_VIEW',               // عرض سجل التدقيق
  BALANCE_ACCRUAL: 'BALANCE_ACCRUAL',     // تشغيل استحقاق الرصيد
  USERS_MANAGE: 'USERS_MANAGE',           // إدارة المستخدمين وصلاحياتهم
  EMPLOYEES_VIEW: 'EMPLOYEES_VIEW',       // عرض الموظفين
  EMPLOYEES_MANAGE: 'EMPLOYEES_MANAGE',   // إضافة/تعديل الموظفين
  DEPARTMENTS_MANAGE: 'DEPARTMENTS_MANAGE',
  LEAVE_TYPES_MANAGE: 'LEAVE_TYPES_MANAGE',
  LEAVES_VIEW: 'LEAVES_VIEW',
  LEAVES_CREATE: 'LEAVES_CREATE',
  LEAVES_PRINT: 'LEAVES_PRINT',           // طباعة/تصدير تقرير الإجازات
  REPORTS_VIEW: 'REPORTS_VIEW',
  REPORTS_EXPORT: 'REPORTS_EXPORT',       // تصدير تقارير PDF/Excel
  SETTINGS_VIEW: 'SETTINGS_VIEW',
  SCHEDULES_VIEW: 'SCHEDULES_VIEW',       // عرض جداول الدوام
  SCHEDULES_MANAGE: 'SCHEDULES_MANAGE',   // إدارة جميع الجداول (تجاوز فلتر القسم)
  SCHEDULES_APPROVE: 'SCHEDULES_APPROVE', // مصادقة جداول الدوام (اعتماد + تعديل/حذف المعتمد)
  FINGERPRINT_OFFICER: 'FINGERPRINT_OFFICER',   // موظف بصمة - إنشاء كشوف غياب لأقسامه
  FINGERPRINT_MANAGER: 'FINGERPRINT_MANAGER',   // مدير البصمة - مصادقة وتجميع
  HOLIDAYS_VIEW: 'HOLIDAYS_VIEW',               // عرض العطل
  HOLIDAYS_MANAGE: 'HOLIDAYS_MANAGE',           // إضافة/تعديل/حذف العطل
  ADMIN: 'ADMIN',                         // صلاحية كاملة
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<string, string> = {
  LEAVES_APPROVE: 'اعتماد/رفض الإجازات',
  ABSENCES_CREATE: 'تسجيل الغياب',
  ABSENCES_CANCEL: 'إلغاء الغياب',
  AUDIT_VIEW: 'عرض سجل التدقيق',
  BALANCE_ACCRUAL: 'استحقاق الرصيد الشهري',
  USERS_MANAGE: 'إدارة المستخدمين',
  EMPLOYEES_VIEW: 'عرض الموظفين',
  EMPLOYEES_MANAGE: 'إدارة الموظفين',
  DEPARTMENTS_MANAGE: 'إدارة الأقسام',
  LEAVE_TYPES_MANAGE: 'إدارة أنواع الإجازات',
  LEAVES_VIEW: 'عرض الإجازات',
  LEAVES_CREATE: 'إنشاء طلب إجازة',
  LEAVES_PRINT: 'طباعة/تصدير تقرير الإجازات',
  REPORTS_VIEW: 'عرض التقارير',
  REPORTS_EXPORT: 'تصدير التقارير',
  SETTINGS_VIEW: 'الإعدادات',
  SCHEDULES_VIEW: 'عرض جداول الدوام',
  SCHEDULES_MANAGE: 'إدارة جداول الدوام',
  SCHEDULES_APPROVE: 'مصادقة جداول الدوام',
  FINGERPRINT_OFFICER: 'موظف بصمة (كشوف الغياب)',
  FINGERPRINT_MANAGER: 'مدير البصمة (مصادقة الكشوف)',
  HOLIDAYS_VIEW: 'عرض العطل',
  HOLIDAYS_MANAGE: 'إدارة العطل',
  ADMIN: 'صلاحية كاملة',
};

/** تبعيات الصلاحيات: لا يمكن منح صلاحية دون الصلاحيات المعتمدة عليها (للعرض في واجهة الإدارة فقط) */
export const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
  EMPLOYEES_MANAGE: ['EMPLOYEES_VIEW'],
  LEAVES_APPROVE: ['LEAVES_VIEW'],
  LEAVES_PRINT: ['LEAVES_VIEW'],
  LEAVES_CREATE: ['LEAVES_VIEW'],
  REPORTS_EXPORT: ['REPORTS_VIEW'],
  SCHEDULES_MANAGE: ['SCHEDULES_VIEW'],
  SCHEDULES_APPROVE: ['SCHEDULES_VIEW'],
  HOLIDAYS_MANAGE: ['HOLIDAYS_VIEW', 'LEAVES_VIEW'],
  FINGERPRINT_MANAGER: ['FINGERPRINT_OFFICER'],
};

/** تجميع الصلاحيات حسب الوحدة (للعرض الهرمي في صفحة الصلاحيات) */
export const PERMISSION_MODULES: Record<string, string[]> = {
  'الموظفون': ['EMPLOYEES_VIEW', 'EMPLOYEES_MANAGE'],
  'الأقسام': ['DEPARTMENTS_MANAGE'],
  'الإجازات': ['LEAVES_VIEW', 'LEAVES_CREATE', 'LEAVES_APPROVE', 'LEAVES_PRINT', 'LEAVE_TYPES_MANAGE'],
  'العطل': ['HOLIDAYS_VIEW', 'HOLIDAYS_MANAGE'],
  'الغيابات': ['ABSENCES_CREATE', 'ABSENCES_CANCEL'],
  'البصمة': ['FINGERPRINT_OFFICER', 'FINGERPRINT_MANAGER'],
  'جداول الدوام': ['SCHEDULES_VIEW', 'SCHEDULES_MANAGE', 'SCHEDULES_APPROVE'],
  'التقارير': ['REPORTS_VIEW', 'REPORTS_EXPORT'],
  'النظام': ['USERS_MANAGE', 'AUDIT_VIEW', 'SETTINGS_VIEW', 'BALANCE_ACCRUAL', 'ADMIN'],
};
