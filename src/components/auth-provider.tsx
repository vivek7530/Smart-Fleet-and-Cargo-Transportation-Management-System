'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import type { Role, SessionUser } from '@/lib/types';

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Client-side convenience only — the API enforces the real rules. */
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export const SESSION_QUERY_KEY = ['session'] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        const result = await api.get<{ user: SessionUser }>('/auth/me');
        return result.user;
      } catch (error) {
        // Not signed in is a normal state, not a query failure.
        if (error instanceof ApiError && (error.isUnauthenticated || error.isForbidden)) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async (input: { identifier: string; password: string }) => {
      const result = await api.post<{ user: SessionUser }>('/auth/login', input);
      return result.user;
    },
    onSuccess(user) {
      queryClient.setQueryData(SESSION_QUERY_KEY, user);
    },
  });

  const login = React.useCallback(
    async (identifier: string, password: string) => loginMutation.mutateAsync({ identifier, password }),
    [loginMutation],
  );

  const logout = React.useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      // Everything cached belonged to the previous session.
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.clear();
      router.replace('/login');
    }
  }, [queryClient, router]);

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  }, [queryClient]);

  const user = data ?? null;

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refresh,
      hasRole: (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
    }),
    [user, isLoading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Narrowed accessor for screens that are always behind the auth guard. */
export function useCurrentUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser called outside an authenticated screen');
  return user;
}
