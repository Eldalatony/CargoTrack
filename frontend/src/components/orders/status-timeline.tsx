import type { OrderStatus, StatusChange } from "@/lib/api/types";
import { dateTime, label } from "@/lib/format";
import { ORDER_HAPPY_PATH } from "@/lib/lifecycles";

/**
 * The shipment timeline: the 8 happy-path steps, each marked done, current
 * or still to come, with the date it was reached. An order on an exception
 * branch says so under the steps.
 */
export function StatusTimeline({
  status,
  history,
}: {
  status: OrderStatus;
  history: StatusChange[];
}) {
  const reachedAt = new Map<string, string>();
  for (const change of history) {
    reachedAt.set(change.toStatus, change.changedAt);
  }

  const furthest = Math.max(
    ...ORDER_HAPPY_PATH.map((step, index) =>
      reachedAt.has(step) ? index : -1,
    ),
  );

  return (
    <>
      <ol>
        {ORDER_HAPPY_PATH.map((step, index) => {
          const state =
            step === status
              ? "current"
              : index <= furthest
                ? "done"
                : "upcoming";

          return (
            <li key={step} data-state={state}>
              {state === "done" ? "[x] " : state === "current" ? "[>] " : "[ ] "}
              {label(step)}
              {reachedAt.has(step) ? ` — ${dateTime(reachedAt.get(step))}` : ""}
            </li>
          );
        })}
      </ol>
      {!ORDER_HAPPY_PATH.includes(status) && (
        <p>
          <strong>Current status: {label(status)}</strong>
          {status === "DOCUMENTS_WITHHELD" &&
            " — the goods are delivered; documents are released once the balance is paid."}
        </p>
      )}
    </>
  );
}

/** The raw audit trail, oldest first. */
export function HistoryTable({ history }: { history: StatusChange[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>When</th>
          <th>From</th>
          <th>To</th>
          <th>By</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {history.map((change) => (
          <tr key={change.id}>
            <td>{dateTime(change.changedAt)}</td>
            <td>{label(change.fromStatus)}</td>
            <td>{label(change.toStatus)}</td>
            <td>{change.changedByUser?.name ?? "—"}</td>
            <td>{change.reason ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
