'use client';

import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionIcon?: LucideIcon;
  onAction?: () => void;
  className?: string;
  compact?: boolean;
};

/**
 * حالة فراغ موحدة للقوائم والجداول.
 * استخدمها عندما لا توجد بيانات لعرضها مع خيار إجراء واضح.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  className = '',
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-12' : 'py-20'} ${className}`}
      role="status"
      aria-label={title}
    >
      <div
        className={`rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center shadow-inner ${
          compact ? 'h-14 w-14 mb-3' : 'h-20 w-20 mb-5'
        }`}
      >
        <Icon className={compact ? 'h-7 w-7 text-gray-400' : 'h-10 w-10 text-gray-400'} />
      </div>
      <p className="text-gray-700 font-semibold">{title}</p>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-sm">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4 gap-2" size={compact ? 'sm' : 'default'}>
          {ActionIcon && <ActionIcon className="h-4 w-4" />}
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
