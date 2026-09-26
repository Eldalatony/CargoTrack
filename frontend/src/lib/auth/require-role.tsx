"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { FullPageLoader } from "@/components/common/full-page-loader";
import type { Role } from "@/lib/api/types";
import { homeFor, useAuth } from "./auth-context";

/**
 * Role-aware routing. Signed out goes to /login; the wrong role goes to its
 * own home, so a client typing /manager lands back in the portal.
 */
export function RequireRole({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "anonymous") {
      router.replace("/login");
    } else if (state.status === "authenticated" && state.user.role !== role) {
      router.replace(homeFor(state.user.role));
    }
  }, [state, role, router]);

  if (state.status !== "authenticated" || state.user.role !== role) {
    return <FullPageLoader />;
  }

  return <>{children}</>;
}
