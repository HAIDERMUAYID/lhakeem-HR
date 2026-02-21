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
          'flex h-11 w-full rounded-xl border bg-white px-4 text-base transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
          error ? 'border-red-300' : 'border-gray-200',
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
