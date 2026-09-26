"use client";

import { AppShell, type NavLink } from "@/components/layout/app-shell";
import { RequireRole } from "@/lib/auth/require-role";

const LINKS: NavLink[] = [
  {
    href: "/portal",
    label: "Your shipments",
    match: (pathname) => pathname === "/portal" || pathname.startsWith("/portal/orders/"),
  },
  { href: "/portal/notifications", label: "Messages" },
];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole role="CLIENT">
      <AppShell area="Portal" links={LINKS}>
        {children}
      </AppShell>
    </RequireRole>
  );
}
