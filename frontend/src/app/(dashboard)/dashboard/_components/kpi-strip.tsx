'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type KpiCard = {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  tone?: 'default' | 'warn' | 'danger';
};

const toneStyles = {
  default: {
    icon: 'bg-slate-100 text-slate-700',
    value: 'text-gray-900',
  },
  warn: {
    icon: 'bg-amber-50 text-amber-700',
    value: 'text-amber-800',
  },
  danger: {
    icon: 'bg-rose-50 text-rose-700',
    value: 'text-rose-800',
  },
};

export function KpiStrip({ cards }: { cards: KpiCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const tone = toneStyles[card.tone ?? 'default'];
        return (
          <Link key={card.key} href={card.href} className="group block h-full">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-500">{card.label}</p>
                    <p className={cn('mt-1 text-2xl sm:text-3xl font-bold tabular-nums', tone.value)}>
                      {card.value}
                    </p>
                    {card.hint && <p className="mt-1 text-xs text-gray-500 truncate">{card.hint}</p>}
                  </div>
                  <div className={cn('rounded-xl p-2.5 shrink-0', tone.icon)}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 flex items-center gap-1 text-xs font-medium text-primary-700 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  فتح الصفحة
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
