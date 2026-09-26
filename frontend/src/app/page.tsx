"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { FullPageLoader } from "@/components/common/full-page-loader";
import { homeFor, useAuth } from "@/lib/auth/auth-context";

/** Sends each visitor to where they belong: login, dashboard or portal. */
export default function Home() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "anonymous") {
      router.replace("/login");
    } else if (state.status === "authenticated") {
      router.replace(homeFor(state.user.role));
    }
  }, [state, router]);

  return <FullPageLoader />;
}
