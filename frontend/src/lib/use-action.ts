"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * A write to the API. On success every cached query is refetched: at this
 * scale that is cheaper than keeping a map of which write touches which read,
 * and a status change here really does ripple (settlement, documents, history).
 */
export function useAction<TVariables = void, TResult = unknown>(
  run: (variables: TVariables) => Promise<TResult>,
  onDone?: (result: TResult) => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: run,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      onDone?.(result);
    },
  });
}
