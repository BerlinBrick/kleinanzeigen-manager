'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface AccountSummary {
  id: string;
  display_name: string;
  is_default: boolean;
  created_at?: string;
  last_sync: string | null;
  republish_default_days: number;
  login_status: 'connected' | 'disconnected' | 'no_credentials';
  ad_count: number;
  unread: number | null;
}

interface AccountsResponse {
  accounts: AccountSummary[];
  total: number;
}

interface AccountContextValue {
  accounts: AccountSummary[];
  activeAccountId: string | null;
  activeAccount: AccountSummary | null;
  setActiveAccount: (id: string) => void;
  refresh: () => void;
  isLoading: boolean;
}

const AccountContext = createContext<AccountContextValue>({
  accounts: [],
  activeAccountId: null,
  activeAccount: null,
  setActiveAccount: () => {},
  refresh: () => {},
  isLoading: true,
});

const STORAGE_KEY = 'active_account_id';

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<AccountsResponse>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/api/accounts'),
    staleTime: 15_000,
  });

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const [activeAccountId, setActiveIdState] = useState<string | null>(null);

  // Resolve the active account once accounts load; persist so the api client
  // (which reads localStorage) tags every request with the right account.
  useEffect(() => {
    if (!accounts.length) return;
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = stored && accounts.some((a) => a.id === stored);
    const next = valid ? stored! : accounts.find((a) => a.is_default)?.id ?? accounts[0].id;
    if (next !== activeAccountId) {
      setActiveIdState(next);
      localStorage.setItem(STORAGE_KEY, next);
    }
  }, [accounts, activeAccountId]);

  const setActiveAccount = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setActiveIdState(id);
    // Every account-scoped query must refetch against the newly selected account.
    queryClient.invalidateQueries();
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['accounts-overview'] });
  };

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  return (
    <AccountContext.Provider
      value={{ accounts, activeAccountId, activeAccount, setActiveAccount, refresh, isLoading }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
