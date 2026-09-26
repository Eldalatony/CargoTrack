import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { FadeIn } from "@/components/motion";
import { cn } from "@/lib/utils";

/** The content column: 1440px max, 20px gutter (16px on phones). */
export function PageContainer({
  className,
  narrow = false,
  children,
}: {
  className?: string;
  narrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FadeIn
      className={cn(
        "mx-auto flex w-full flex-col gap-5 px-4 pt-6 pb-16 sm:px-5",
        narrow ? "max-w-[720px]" : "max-w-[1440px]",
        className,
      )}
    >
      {children}
    </FadeIn>
  );
}

/** Page title, one line of context, and the page's primary action. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-3xl font-semibold tracking-tight">{title}</h1>
          {children}
        </div>
        {description && (
          <p className="m-0 max-w-[640px] text-fg-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  );
}

/** "Orders › 3f9a1c20" */
export function Crumbs({
  items,
}: {
  items: { label: React.ReactNode; href?: string; mono?: boolean }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-fg-secondary">
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <ChevronRightIcon className="size-3 text-fg-tertiary" aria-hidden />}
          {item.href ? (
            <Link href={item.href} className="text-fg-secondary hover:text-fg">
              {item.label}
            </Link>
          ) : (
            <span className={cn(item.mono && "font-mono")} aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Uppercase section label — the only uppercase in the product. */
export function Overline({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-2xs font-semibold tracking-overline text-fg-tertiary uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A row of labelled facts inside one bordered strip (the order header). */
export function FactStrip({
  facts,
  className,
}: {
  facts: { label: string; value: React.ReactNode; mono?: boolean; muted?: boolean }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "m-0 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-3 xl:grid-cols-6",
        className,
      )}
    >
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="-mr-px -mb-px border-r border-b border-divider px-4 py-3"
        >
          <dt className="text-xs text-fg-secondary">{fact.label}</dt>
          <dd
            className={cn(
              "mt-1 mb-0 font-medium tabular-nums",
              fact.mono && "font-mono",
              fact.muted && "text-fg-tertiary",
            )}
          >
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Small labelled stat grid used inside cards (payments, capacity). */
export function StatGrid({
  stats,
}: {
  stats: { label: string; value: React.ReactNode; strong?: boolean }[];
}) {
  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px overflow-hidden rounded-md border border-divider bg-[var(--border-subtle)]">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-surface px-3 py-2.5">
          <dt className="text-xs text-fg-secondary">{stat.label}</dt>
          <dd
            className={cn(
              "mt-1 mb-0 flex flex-wrap items-center gap-2 tabular-nums",
              stat.strong ? "font-semibold" : "font-medium",
            )}
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
