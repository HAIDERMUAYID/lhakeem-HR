'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={cn(
              'relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-xl ring-1 ring-black/5',
              'max-h-[94vh] flex flex-col',
              'sm:max-h-[90vh]',
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-4 sm:p-6 shrink-0">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate pr-2">{title}</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="rounded-full min-h-[44px] min-w-[44px] shrink-0"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 min-h-0 safe-area-pb">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
