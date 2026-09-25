import { ApiError } from "@/lib/api/client";

/** Shows the server's own explanation, and the guard name when one refused. */
export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }

  const message = error instanceof Error ? error.message : String(error);
  const guard = error instanceof ApiError ? error.guard : undefined;

  return (
    <p role="alert">
      {guard ? `Blocked by the ${guard} guard: ` : ""}
      {message}
    </p>
  );
}
