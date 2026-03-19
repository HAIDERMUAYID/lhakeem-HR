import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * تنسيق عرض القسم/الوحدة:
 * - إذا وُجدت وحدة: "القسم / الوحدة"
 * - إذا لا: "القسم"
 */
export function formatDeptUnit(params: {
  departmentName?: string | null;
  unitName?: string | null;
}): string {
  const dept = (params.departmentName || '').trim();
  const unit = (params.unitName || '').trim();
  if (!dept && !unit) return '—';
  if (!dept) return unit;
  if (!unit) return dept;
  return `${dept} / ${unit}`;
}
