'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { MotionConfig } from 'motion/react';
import { ApiError } from '@/lib/api';
import { TooltipProvider } from '@/components/ui/misc';
import { AuthProvider } from '@/components/auth-provider';
import { ThemeProvider } from '@/components/theme-provider';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry(failureCount, error) {
          // Authentication and permission failures will never succeed on retry.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Created once per browser session so the cache survives navigation.
  const [queryClient] = React.useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider delayDuration={250} skipDelayDuration={300}>
              {children}
              <Toaster
                position="top-center"
                richColors
                closeButton
                toastOptions={{ className: 'text-[13px] font-sans rounded-xl' }}
              />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
