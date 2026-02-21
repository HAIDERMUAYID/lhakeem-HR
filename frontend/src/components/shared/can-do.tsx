'use client';

import { useHasPermission } from '@/hooks/use-permissions';
import type { PermissionCode } from '@/lib/permissions';

interface CanDoProps {
  /** صلاحية واحدة أو عدة صلاحيات (أي واحدة تكفي) */
  permission: PermissionCode | PermissionCode[];
  children: React.ReactNode;
  /** محتوى بديل يُعرض عند عدم وجود الصلاحية (اختياري) */
  fallback?: React.ReactNode;
}

/**
 * يعرض الأطفال فقط إن كان المستخدم يملك الصلاحية المطلوبة.
 * يُستخدم لإخفاء أزرار إضافة/تعديل/حذف/اعتماد/تصدير حسب الصلاحيات.
 */
export function CanDo({ permission, children, fallback = null }: CanDoProps) {
  const allowed = useHasPermission(permission);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
