'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AccountSummary } from '@/contexts/AccountContext';

export interface AccountOverview {
  totals: {
    accounts: number;
    connected: number;
    active_ads: number;
    unread: number;
    automations: number;
  };
  accounts: Array<{
    id: string;
    display_name: string;
    is_default: boolean;
    login_status: 'connected' | 'disconnected' | 'no_credentials';
    ad_count: number;
    active_ads: number;
    automations: number;
    unread: number | null;
    last_sync: string | null;
  }>;
  recent_ads: Array<{
    account_id: string;
    account_name: string;
    title: string;
    id: number | null;
    active: boolean;
    created_on: string | null;
    updated_on: string | null;
  }>;
}

export function useAccountsList() {
  return useQuery<{ accounts: AccountSummary[]; total: number }>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/api/accounts'),
  });
}

export function useAccountsOverview() {
  return useQuery<AccountOverview>({
    queryKey: ['accounts-overview'],
    queryFn: () => api.get('/api/accounts/overview'),
    refetchInterval: 60_000,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['accounts'] });
  qc.invalidateQueries({ queryKey: ['accounts-overview'] });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (display_name: string) => api.post('/api/accounts', { display_name }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Record<string, unknown> }) =>
      api.put(`/api/accounts/${id}`, updates),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/accounts/${id}`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDisconnectAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/accounts/${id}/disconnect`, {}),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAccountCredentials(id: string | null) {
  return useQuery<{ username: string; password: string; login_status: string }>({
    queryKey: ['account-credentials', id],
    queryFn: () => api.get(`/api/accounts/${id}/credentials`),
    enabled: !!id,
  });
}

export function useSetCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, username, password }: { id: string; username: string; password: string }) =>
      api.put(`/api/accounts/${id}/credentials`, { username, password }),
    onSuccess: (_d, vars) => {
      invalidateAll(qc);
      qc.invalidateQueries({ queryKey: ['account-credentials', vars.id] });
    },
  });
}

// PATCH is not exposed by the api client; alias PUT to /api/accounts/:id which
// the route also handles for display-name/settings updates.
export function useRenameAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, display_name }: { id: string; display_name: string }) =>
      api.put(`/api/accounts/${id}`, { display_name }),
    onSuccess: () => invalidateAll(qc),
  });
}
