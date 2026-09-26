"use client";

import type { UseQueryResult } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { ErrorMessage } from "./error-message";

/** Loading / error / data, the same way on every screen. */
export function QueryState<T>({
  query,
  loading,
  children,
}: {
  query: UseQueryResult<T>;
  /** A skeleton shaped like the content; defaults to a few lines. */
  loading?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) {
    return <>{loading ?? <LoadingLines />}</>;
  }

  if (query.isError) {
    return <ErrorMessage error={query.error} />;
  }

  return <>{children(query.data)}</>;
}

export function LoadingLines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4" aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-6" style={{ width: `${92 - index * 9}%` }} />
      ))}
    </div>
  );
}

/** A page-shaped skeleton for detail screens. */
export function LoadingPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 pt-6 sm:px-5" aria-busy aria-label="Loading">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-80 max-w-full" />
      <Skeleton className="h-16" />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
