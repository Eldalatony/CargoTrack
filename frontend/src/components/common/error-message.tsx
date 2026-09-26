import { ShieldAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const GUARD_NAMES: Record<string, string> = {
  deposit: "deposit",
  balance: "balance",
  qc_signoff: "QC sign-off",
};

/**
 * Shows the server's own explanation. When a guard refused the move
 * (deposit, balance, capacity…) the title names it, so the office knows
 * which condition to clear.
 */
export function ErrorMessage({
  error,
  className,
  children,
}: {
  error: unknown;
  className?: string;
  /** Follow-up actions, e.g. "Record balance payment". */
  children?: React.ReactNode;
}) {
  if (!error) {
    return null;
  }

  const message = error instanceof Error ? error.message : String(error);
  const guard = error instanceof ApiError ? error.guard : undefined;

  return (
    <Alert variant="destructive" className={cn("max-w-[720px]", className)}>
      <ShieldAlertIcon />
      <AlertTitle>
        {guard
          ? `Blocked by the ${GUARD_NAMES[guard] ?? guard.replace(/_/g, " ")} guard`
          : "That didn’t go through"}
      </AlertTitle>
      <AlertDescription>
        <p className="m-0">{message}</p>
        {children && <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>}
      </AlertDescription>
    </Alert>
  );
}
