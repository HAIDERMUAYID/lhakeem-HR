'use client';

import { useState, useEffect } from 'react';

/**
 * استعلام وسائط للتحقق من عرض الشاشة (مثلاً تحت md للتبديل إلى Card View).
 * يتجنب hydration mismatch بتهيئة false ثم التحديث بعد mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** الشاشة أقل من 768px (استخدام Card View) */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)');
}

/** الشاشة أقل من 1024px (القائمة Drawer) */
export function useIsTabletOrMobile() {
  return useMediaQuery('(max-width: 1023px)');
}
