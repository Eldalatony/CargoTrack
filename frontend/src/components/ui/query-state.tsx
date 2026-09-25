"use client";

import type { UseQueryResult } from "@tanstack/react-query";

import { ErrorMessage } from "./error-message";

/** Loading / error / data, the same way on every screen. */
export function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) {
    return <p>Loading…</p>;
  }

  if (query.isError) {
    return <ErrorMessage error={query.error} />;
  }

  return <>{children(query.data)}</>;
}
