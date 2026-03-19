import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex min-h-[44px] h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base',
        'transition-all duration-200',
        'shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
        'placeholder:text-gray-400',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:border-primary-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
