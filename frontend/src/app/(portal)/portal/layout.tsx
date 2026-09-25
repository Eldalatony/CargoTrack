"use client";

import { AppShell } from "@/components/app-shell";
import { RequireRole } from "@/lib/auth/require-role";

const LINKS = [
  { href: "/portal", label: "My orders" },
  { href: "/portal/notifications", label: "Messages" },
];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole role="CLIENT">
      <AppShell area="Client portal" links={LINKS}>
        {children}
      </AppShell>
    </RequireRole>
  );
}
