import { AnyStatusBadge } from "@/components/common/status-badge";
import { SectionCard } from "@/components/common/section-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StatusChange } from "@/lib/api/types";
import { dateTime, statusLabelOrDash } from "@/lib/history";

/** The read-only audit trail, newest first. Used for orders and containers. */
export function StatusHistoryCard({
  id,
  history,
  reasonHeader = "Reason",
}: {
  id?: string;
  history: StatusChange[];
  reasonHeader?: string;
}) {
  const rows = [...history].reverse();

  return (
    <SectionCard
      id={id}
      title="Status history"
      description="Newest first · read-only audit trail"
      flush
    >
      <Table style={{ minWidth: 720 }}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">When</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>By</TableHead>
            <TableHead>{reasonHeader}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-fg-secondary">
                Nothing recorded yet.
              </TableCell>
            </TableRow>
          )}
          {rows.map((change) => (
            <TableRow key={change.id}>
              <TableCell className="whitespace-nowrap text-fg-secondary tabular-nums">
                {dateTime(change.changedAt)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-fg-secondary">
                {statusLabelOrDash(change.fromStatus)}
              </TableCell>
              <TableCell>
                <AnyStatusBadge status={change.toStatus} size="sm" />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {change.changedByUser?.name ?? "—"}
              </TableCell>
              <TableCell className="text-fg-secondary">{change.reason || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}
