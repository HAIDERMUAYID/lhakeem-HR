'use client';

import * as React from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  variant = 'default',
  onConfirm,
  loading = false,
  children,
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const busy = loading || isLoading;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-6 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xl duration-200',
            'max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <div className="space-y-2">
            <AlertDialog.Title className="text-base sm:text-lg font-semibold text-gray-900">
              {title}
            </AlertDialog.Title>
            {description && (
              <AlertDialog.Description className="text-sm text-gray-500">
                {description}
              </AlertDialog.Description>
            )}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel
              className={cn(buttonVariants({ variant: 'secondary' }), 'min-w-[100px] min-h-[44px]')}
              disabled={busy}
            >
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              className={cn(
                'min-w-[100px] min-h-[44px]',
                variant === 'danger'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : buttonVariants()
              )}
              disabled={busy}
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  جاري التنفيذ...
                </span>
              ) : (
                confirmLabel
              )}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
