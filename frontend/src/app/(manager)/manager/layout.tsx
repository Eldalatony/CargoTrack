"use client";

import { AppShell } from "@/components/app-shell";
import { RequireRole } from "@/lib/auth/require-role";

const LINKS = [
  { href: "/manager", label: "Orders" },
  { href: "/manager/orders/new", label: "Place order" },
  { href: "/manager/containers", label: "Containers" },
  { href: "/manager/notifications", label: "Notifications" },
  { href: "/manager/clients", label: "Clients" },
  { href: "/manager/suppliers", label: "Suppliers" },
];

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole role="OFFICE_MANAGER">
      <AppShell area="Office Manager" links={LINKS}>
        {children}
      </AppShell>
    </RequireRole>
  );
}
