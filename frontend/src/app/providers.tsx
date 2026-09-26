"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { MotionProvider } from "@/components/motion";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/client";
import { AuthProvider } from "@/lib/auth/auth-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            // A 4xx will not fix itself on a retry.
            retry: (failures, error) =>
              !(error instanceof ApiError && error.status < 500) &&
              failures < 2,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MotionProvider>
            <TooltipProvider delayDuration={300}>
              {children}
              <Toaster position="bottom-right" />
            </TooltipProvider>
          </MotionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
