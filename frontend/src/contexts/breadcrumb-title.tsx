'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

type BreadcrumbTitleContextType = {
  /** تسمية اختيارية لآخر جزء في المسار (مثل اسم الموظف) */
  lastSegmentLabel: string | null;
  setLastSegmentLabel: (label: string | null) => void;
};

const BreadcrumbTitleContext = createContext<BreadcrumbTitleContextType | null>(null);

export function BreadcrumbTitleProvider({ children }: { children: React.ReactNode }) {
  const [lastSegmentLabel, setLastSegmentLabel] = useState<string | null>(null);
  return (
    <BreadcrumbTitleContext.Provider value={{ lastSegmentLabel, setLastSegmentLabel }}>
      {children}
    </BreadcrumbTitleContext.Provider>
  );
}

export function useBreadcrumbTitle() {
  const ctx = useContext(BreadcrumbTitleContext);
  return ctx ?? { lastSegmentLabel: null, setLastSegmentLabel: () => {} };
}
