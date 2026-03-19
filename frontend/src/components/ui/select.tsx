'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
  id?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'اختر...',
  disabled = false,
  error,
  className,
  id,
}: SelectProps) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          // elevation + focus (Premium dropdown)
          'elevation-1 flex h-11 w-full rounded-2xl px-4 text-base transition-all duration-200 hover:elevation-2',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25 focus-visible:border-primary-500',
          error ? 'border-red-200 ring-red-500/20 focus-visible:border-red-500' : '',
          disabled && 'cursor-not-allowed opacity-60',
          className
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
