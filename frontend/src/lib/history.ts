import type { StatusChange } from "./api/types";
import { dateTime, shortDate } from "./format";
import { statusMeta } from "./status";

export { dateTime };

export function statusLabelOrDash(status: string | null) {
  return status ? statusMeta(status).label : "—";
}

/** When each status was (last) reached, from the audit trail. */
export function reachedAt(history: StatusChange[]) {
  const reached = new Map<string, string>();
  for (const change of history) {
    reached.set(change.toStatus, change.changedAt);
  }
  return reached;
}

/** "14 Sep" for the step under a status, or "" if never reached. */
export function stepDate(reached: Map<string, string>, status: string) {
  return shortDate(reached.get(status));
}

/** The most recent change into `status`, e.g. to read why it was withheld. */
export function lastChangeTo(history: StatusChange[], status: string) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].toStatus === status) {
      return history[i];
    }
  }
  return undefined;
}
