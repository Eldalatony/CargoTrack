import { Loader2Icon } from "lucide-react";

/** Shown while the session is checked and before a redirect lands. */
export function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy aria-label="Loading">
      <div className="flex items-center gap-2.5 text-sm text-fg-secondary">
        <Loader2Icon className="size-4 animate-spin text-brand" />
        Loading CargoTrack…
      </div>
    </div>
  );
}
