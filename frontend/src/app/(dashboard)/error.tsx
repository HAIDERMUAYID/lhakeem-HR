'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
      <div className="rounded-2xl bg-red-50 p-6 max-w-md">
        <AlertTriangle className="h-16 w-16 text-red-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">حدث خطأ</h2>
        <p className="text-gray-600 mb-6">{error.message}</p>
        <Button onClick={reset}>إعادة المحاولة</Button>
      </div>
    </div>
  );
}
