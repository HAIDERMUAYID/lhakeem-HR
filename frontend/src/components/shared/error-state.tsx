'use client';

import { LucideIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ErrorStateProps = {
  title?: string;
  message?: string;
  icon?: LucideIcon;
  onRetry?: () => void;
  className?: string;
};

/**
 * حالة خطأ موحدة عند فشل تحميل البيانات أو تنفيذ عملية.
 */
export function ErrorState({
  title = 'حدث خطأ',
  message = 'حدث خطأ في تحميل البيانات',
  icon: Icon = AlertCircle,
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-20 ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="h-20 w-20 rounded-2xl bg-red-50 flex items-center justify-center mb-5">
        <Icon className="h-10 w-10 text-red-500" />
      </div>
      <p className="text-gray-900 font-semibold">{title}</p>
      {message && <p className="text-sm text-gray-500 mt-1 max-w-sm">{message}</p>}
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="mt-4">
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
