'use client';

const COPYRIGHT_TEXT = 'جميع الحقوق محفوظة لمستشفى الحكيم العام © 2026';

interface CopyrightFooterProps {
  /** للخلفية الفاتحة (صفحة الدخول) استخدم variant="light" */
  variant?: 'light' | 'default';
  className?: string;
}

export function CopyrightFooter({ variant = 'default', className = '' }: CopyrightFooterProps) {
  return (
    <footer
      className={
        variant === 'light'
          ? `text-center text-xs text-gray-500 ${className}`
          : `text-center text-xs text-gray-500 py-2 ${className}`
      }
    >
      {COPYRIGHT_TEXT}
      <span className="text-primary-600 font-medium mr-1" aria-hidden>®</span>
    </footer>
  );
}
