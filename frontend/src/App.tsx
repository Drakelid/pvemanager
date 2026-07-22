import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { router } from '@/router';
import { useAuthStore } from '@/stores/auth-store';
import { ConfirmDialogProvider } from '@/components/shared/ConfirmDialog';
import { queryClient } from '@/lib/query-client';

export default function App() {
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={200}>
        <ConfirmDialogProvider>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" richColors />
        </ConfirmDialogProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
