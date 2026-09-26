"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** "Page 2 of 5 (112 orders)" with prev / numbered pages / next. */
export function Pagination({
  page,
  totalPages,
  summary,
  onPage,
  className,
}: {
  page: number;
  totalPages: number;
  summary: React.ReactNode;
  onPage: (page: number) => void;
  className?: string;
}) {
  const pages = pageWindow(page, Math.max(1, totalPages));

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-divider px-4 py-2.5",
        className,
      )}
    >
      <span className="text-sm text-fg-secondary tabular-nums">
        Page {page} of {Math.max(1, totalPages)} ({summary})
      </span>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="disabled:border-transparent disabled:bg-transparent"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>
        {pages.map((value, index) =>
          value === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-fg-tertiary">
              …
            </span>
          ) : (
            <Button
              key={value}
              variant="ghost"
              size="icon-sm"
              aria-current={value === page ? "page" : undefined}
              onClick={() => onPage(value)}
              className="min-w-7 w-auto px-1.5 text-sm tabular-nums aria-[current=page]:border-brand-soft-border aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand-text"
            >
              {value}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="disabled:border-transparent disabled:bg-transparent"
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

/** 1 … 4 5 6 … 12 */
function pageWindow(page: number, total: number): (number | "gap")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const around = [page - 1, page, page + 1].filter((p) => p > 1 && p < total);
  const result: (number | "gap")[] = [1];
  if (around[0] > 2) result.push("gap");
  result.push(...around);
  if (around[around.length - 1] < total - 1) result.push("gap");
  result.push(total);
  return result;
}
