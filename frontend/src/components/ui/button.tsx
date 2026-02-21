import * as React from 'react';
import { cn } from '@/lib/utils';

const variantStyles: Record<string, string> = {
  default: 'bg-primary-700 text-white hover:bg-primary-800',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
  outline: 'border-2 border-primary-700 text-primary-700 hover:bg-primary-50',
  ghost: 'hover:bg-gray-100',
};

const sizeStyles: Record<string, string> = {
  default: 'h-11 px-6',
  sm: 'h-9 px-4',
  lg: 'h-12 px-8',
  icon: 'h-11 w-11',
};

export const buttonVariants = (opts?: { variant?: keyof typeof variantStyles; size?: keyof typeof sizeStyles }) => {
  const v = opts?.variant ?? 'default';
  const s = opts?.size ?? 'default';
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:pointer-events-none disabled:opacity-50 min-h-touch touch-manipulation',
    variantStyles[v],
    sizeStyles[s]
  );
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild, children, ...props }, ref) => {
    const styles = cn(
      'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:pointer-events-none disabled:opacity-50 min-h-touch touch-manipulation',
      variantStyles[variant],
      sizeStyles[size],
      className
    );
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<{ className?: string; ref?: React.Ref<unknown> }>, {
        className: cn(styles, (children as React.ReactElement<{ className?: string }>).props?.className),
        ref,
      });
    }
    return (
      <button className={styles} ref={ref} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button };
