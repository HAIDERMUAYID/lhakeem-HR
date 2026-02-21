'use client';

import { useState, useEffect } from 'react';
import { hasAnyPermission, type PermissionCode } from '@/lib/permissions';

export function usePermissions(): string[] {
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    try {
      const u = localStorage.getItem('user');
      const parsed = u ? JSON.parse(u) : null;
      setPermissions(parsed?.permissions ?? []);
    } catch {
      setPermissions([]);
    }
  }, []);

  return permissions;
}

/** هل المستخدم يملك أي صلاحية من المطلوبة؟ */
export function useHasPermission(required: PermissionCode | PermissionCode[]): boolean {
  const permissions = usePermissions();
  return hasAnyPermission(permissions, required);
}
