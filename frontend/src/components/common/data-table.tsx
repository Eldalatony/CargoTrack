"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Per-column layout hints, read by the table below. */
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: "left" | "right";
    headClassName?: string;
    cellClassName?: string;
  }
}

/**
 * The office table, powered by TanStack Table. Sorting is client-side over
 * the rows it is given (the API returns a fixed order). Quantities
 * right-align; the sort arrow sits on the inner side of the label.
 */
export function DataTable<TData>({
  columns,
  data,
  initialSorting = [],
  onRowClick,
  rowClassName,
  empty,
  footer,
  minWidth = 720,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  initialSorting?: SortingState;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: Row<TData>) => string | undefined;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  minWidth?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table style={{ minWidth }}>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => {
              const meta = header.column.columnDef.meta;
              const sortable = header.column.getCanSort();
              const direction = header.column.getIsSorted();
              const right = meta?.align === "right";

              return (
                <TableHead
                  key={header.id}
                  aria-sort={
                    sortable
                      ? direction === "asc"
                        ? "ascending"
                        : direction === "desc"
                          ? "descending"
                          : "none"
                      : undefined
                  }
                  className={cn(right && "text-right", sortable && "p-0 first:pl-0 last:pr-0", meta?.headClassName)}
                >
                  {header.isPlaceholder ? null : sortable ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-1 px-3 py-2 outline-none focus-visible:bg-hover in-[th:first-child]:pl-4 in-[th:last-child]:pr-4",
                        right && "flex-row-reverse",
                        direction && "text-fg",
                      )}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {direction === "asc" ? (
                        <ArrowUpIcon className="size-3 text-brand" aria-hidden />
                      ) : direction === "desc" ? (
                        <ArrowDownIcon className="size-3 text-brand" aria-hidden />
                      ) : (
                        <ArrowUpDownIcon className="size-3 text-fg-tertiary opacity-60" aria-hidden />
                      )}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 && empty ? (
          <tr>
            <td colSpan={columns.length} className="border-b border-divider">
              {empty}
            </td>
          </tr>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta;
                return (
                  <TableCell
                    key={cell.id}
                    className={cn(meta?.align === "right" && "text-right tabular-nums", meta?.cellClassName)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        )}
      </TableBody>
      {footer && <TableFooter>{footer}</TableFooter>}
    </Table>
  );
}
