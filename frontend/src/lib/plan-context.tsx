'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { API_BASE, type PlanInfo } from './api';

interface PlanContextValue {
  plan: PlanInfo | null;
  loading: boolean;
  refresh: () => void;
}

const PlanContext = createContext<PlanContextValue>({
  plan: null,
  loading: true,
  refresh: () => {},
});

export function usePlan() {
  return useContext(PlanContext);
}

function getAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('vx_token');
    if (token) h['Authorization'] = `Bearer ${token}`;
    else {
      const key = localStorage.getItem('vx_api_key');
      if (key) h['x-api-key'] = key;
    }
  }
  return h;
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE}/dashboard/plan`, { headers });
      if (res.ok) setPlan(await res.json());
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PlanContext.Provider value={{ plan, loading, refresh: load }}>
      {children}
    </PlanContext.Provider>
  );
}
