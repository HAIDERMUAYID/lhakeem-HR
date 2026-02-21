'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * غلاف لعرض بيانات: جدول من md فما فوق، وقائمة بطاقات تحت md.
 * لا يغيّر سلوك الديسكتوب؛ يستخدم CSS فقط للظهور/الإخفاء لتجنب أي flash.
 */
interface ResponsiveDataViewProps {
  /** محتوى الجدول (يظهر من md فما فوق) */
  tableContent: React.ReactNode;
  /** محتوى البطاقات (يظهر تحت md) */
  cardContent: React.ReactNode;
  /** صنف للحاوية الخارجية */
  className?: string;
  /** صنف لمنطقة الجدول */
  tableClassName?: string;
  /** صنف لمنطقة البطاقات */
  cardClassName?: string;
}

export function ResponsiveDataView({
  tableContent,
  cardContent,
  className,
  tableClassName,
  cardClassName,
}: ResponsiveDataViewProps) {
  return (
    <div className={cn('w-full overflow-hidden', className)}>
      <div className={cn('hidden md:block overflow-x-auto', tableClassName)} data-responsive-table>
        {tableContent}
      </div>
      <div
        className={cn('block md:hidden space-y-3 overflow-x-hidden', cardClassName)}
        data-responsive-cards
      >
        {cardContent}
      </div>
    </div>
  );
}
