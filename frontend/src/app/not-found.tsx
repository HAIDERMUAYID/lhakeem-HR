import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div className="rounded-2xl bg-gray-50 p-8">
        <FileQuestion className="h-20 w-20 text-gray-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">404</h1>
        <p className="text-gray-600 mb-6">الصفحة غير موجودة</p>
        <Link href="/dashboard">
          <Button>العودة للوحة التحكم</Button>
        </Link>
      </div>
    </div>
  );
}
