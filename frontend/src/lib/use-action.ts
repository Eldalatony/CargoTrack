"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * A write to the API. On success every cached query is refetched: at this
 * scale that is cheaper than keeping a map of which write touches which read,
 * and a status change here really does ripple (settlement, documents, history).
 *
 * `success` is the toast shown when it lands. Failures are not toasted: they
 * render next to the control that caused them, with the server's reason.
 */
export function useAction<TVariables = void, TResult = unknown>(
  run: (variables: TVariables) => Promise<TResult>,
  options: {
    success?: string | ((result: TResult, variables: TVariables) => string);
    onDone?: (result: TResult, variables: TVariables) => void;
  } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: run,
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries();
      const { success, onDone } = options;
      if (success) {
        toast.success(
          typeof success === "function" ? success(result, variables) : success,
        );
      }
      onDone?.(result, variables);
    },
  });
}
