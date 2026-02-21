'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AppLogoProps {
  /** ارتفاع الشعار بالبكسل */
  size?: number;
  /** حركة خفيفة عند التحميل وعند المرور */
  animated?: boolean;
  /** للوضع المطوي (أيقونة فقط) */
  compact?: boolean;
  className?: string;
}

export function AppLogo({ size = 44, animated = true, compact = false, className }: AppLogoProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-gray-100',
        animated && 'transition-all duration-300 hover:scale-105 hover:shadow-lg active:scale-100',
        !loaded && !error && 'animate-pulse',
        compact ? 'p-1.5' : 'p-2',
        className
      )}
      style={compact ? { width: size, height: size, minWidth: size, minHeight: size } : { height: size, width: 'auto', minWidth: size }}
    >
      {error ? (
        <div className="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-primary-800">
          <span className="text-white font-bold text-lg">ح</span>
        </div>
      ) : (
        <img
          src="/hospital-logo.png"
          alt="شعار مستشفى الحكيم العام"
          className="object-contain transition-opacity duration-300"
          style={{
            width: 'auto',
            height: '100%',
            maxHeight: size,
            opacity: loaded ? 1 : 0,
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}
