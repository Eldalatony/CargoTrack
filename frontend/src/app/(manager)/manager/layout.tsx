"use client";

import { useQuery } from "@tanstack/react-query";

import { AppShell, type NavLink } from "@/components/layout/app-shell";
import { notifications } from "@/lib/api/queries";
import { RequireRole } from "@/lib/auth/require-role";

/** "Orders" covers the dashboard and each order, but not "Place order". */
const ordersMatch = (pathname: string) =>
  pathname === "/manager" ||
  (pathname.startsWith("/manager/orders/") && pathname !== "/manager/orders/new");

function ManagerShell({ children }: { children: React.ReactNode }) {
  // Dead letters get a red count in the nav on every office screen.
  const summary = useQuery({ ...notifications.summary(), refetchInterval: 30_000 });

  const links: NavLink[] = [
    { href: "/manager", label: "Orders", match: ordersMatch },
    { href: "/manager/orders/new", label: "Place order" },
    { href: "/manager/containers", label: "Containers" },
    {
      href: "/manager/notifications",
      label: "Notifications",
      badge: summary.data?.DEAD_LETTER,
    },
    { href: "/manager/clients", label: "Clients" },
    { href: "/manager/suppliers", label: "Suppliers" },
  ];

  return (
    <AppShell area="Office" links={links}>
      {children}
    </AppShell>
  );
}

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireRole role="OFFICE_MANAGER">
      <ManagerShell>{children}</ManagerShell>
    </RequireRole>
  );
}
