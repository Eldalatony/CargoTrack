"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth, useUser } from "@/lib/auth/auth-context";

/** Header, navigation and sign-out around every signed-in screen. */
export function AppShell({
  area,
  links,
  children,
}: {
  area: string;
  links: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const user = useUser();
  const { logout } = useAuth();
  const router = useRouter();

  return (
    <>
      <header>
        <strong>CargoTrack</strong> — {area}
        <nav>
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p>
          Signed in as {user.name} ({user.email}){" "}
          <button
            type="button"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </p>
      </header>
      <hr />
      <main>{children}</main>
    </>
  );
}
