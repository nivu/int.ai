"use client";

import { createContext, useContext, type ReactNode } from "react";

interface OrgContextValue {
  orgId: string | null;
}

const OrgContext = createContext<OrgContextValue>({ orgId: null });

export function OrgProvider({
  orgId,
  children,
}: {
  orgId: string | null;
  children: ReactNode;
}) {
  return (
    <OrgContext.Provider value={{ orgId }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrgId(): string | null {
  return useContext(OrgContext).orgId;
}
