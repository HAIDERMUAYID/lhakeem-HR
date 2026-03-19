import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants: Record<string, string> = {
  default: 'bg-primary-100 text-primary-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof badgeVariants;
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl px-2.5 py-0.5 text-xs font-medium',
        'border border-black/[0.04] shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
