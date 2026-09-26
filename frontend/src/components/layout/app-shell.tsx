"use client";

import { LogOutIcon, MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { motion } from "@/components/motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth, useUser } from "@/lib/auth/auth-context";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ThemeMenu } from "./theme-menu";

export interface NavLink {
  href: string;
  label: string;
  /** A red count bubble, e.g. dead-letter notifications. */
  badge?: number;
  /** Which paths light this link up; defaults to the href and below. */
  match?: (pathname: string) => boolean;
}

function isActive(link: NavLink, pathname: string) {
  return link.match
    ? link.match(pathname)
    : pathname === link.href || pathname.startsWith(`${link.href}/`);
}

function CountBubble({ count }: { count: number }) {
  return (
    <span
      aria-label={`${count} need attention`}
      className="min-w-[18px] rounded-full bg-danger-solid px-[5px] text-center text-2xs leading-[18px] font-semibold text-on-danger tabular-nums"
    >
      {count}
    </span>
  );
}

/** Wordmark: "CargoTrack" in Plex Sans 600, the area as an overline. */
function Wordmark({ area, href }: { area: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-baseline gap-2 text-fg hover:text-fg hover:no-underline"
    >
      <span className="text-lg leading-none font-semibold tracking-tight">CargoTrack</span>
      <span className="text-2xs font-semibold tracking-overline text-fg-tertiary uppercase">
        {area}
      </span>
    </Link>
  );
}

/**
 * Header, navigation and sign-out around every signed-in screen. Sticky,
 * 52px. The active tab is underlined in brand blue; the underline glides
 * between tabs (Motion shared layout). On phones the links move into a sheet.
 */
export function AppShell({
  area,
  links,
  children,
}: {
  area: string;
  links: NavLink[];
  children: React.ReactNode;
}) {
  const user = useUser();
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const home = links[0]?.href ?? "/";

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex h-13 max-w-[1440px] items-center gap-4 px-4 sm:px-5">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-ml-1.5 md:hidden" aria-label="Open menu">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetHeader className="border-b border-divider">
                <SheetTitle>CargoTrack</SheetTitle>
                <SheetDescription>{user.name}</SheetDescription>
              </SheetHeader>
              <nav aria-label="Main" className="flex flex-col p-2">
                {links.map((link) => {
                  const active = isActive(link, pathname);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-11 items-center justify-between rounded-md px-3 text-base font-medium hover:bg-hover hover:no-underline",
                        active ? "bg-selected text-brand-text" : "text-fg-secondary hover:text-fg",
                      )}
                    >
                      {link.label}
                      {!!link.badge && <CountBubble count={link.badge} />}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <Wordmark area={area} href={home} />

          <nav
            aria-label="Main"
            className="hidden min-w-0 flex-[0_1_auto] items-stretch self-stretch overflow-x-auto [scrollbar-width:none] md:flex"
          >
            {links.map((link) => {
              const active = isActive(link, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2 px-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 hover:no-underline",
                    active ? "text-fg hover:text-fg" : "text-fg-secondary hover:text-fg",
                  )}
                >
                  {link.label}
                  {!!link.badge && <CountBubble count={link.badge} />}
                  {active && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-brand"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <span className="min-w-0 flex-1" />

          <ThemeMenu />
          <div className="flex min-w-0 items-center gap-2">
            <Avatar className="size-7 border border-brand-soft-border" title={user.name}>
              <AvatarFallback className="bg-brand-soft text-2xs font-semibold text-brand-text">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden truncate text-sm font-medium sm:inline">{user.name}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="-ml-1">
            <LogOutIcon />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main key={pathname}>{children}</main>
    </div>
  );
}
