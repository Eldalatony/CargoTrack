import type { Step, StepState } from "@/components/common/stepper";
import type { OrderStatus, StatusChange } from "@/lib/api/types";
import { reachedAt, stepDate } from "@/lib/history";
import { EXCEPTION_AFTER, ORDER_HAPPY_PATH } from "@/lib/lifecycles";
import { ORDER_STATUS } from "@/lib/status";

const EXCEPTION_STATE: Partial<Record<OrderStatus, StepState>> = {
  DOCUMENTS_WITHHELD: "blocked",
  CANCELLED: "cancelled",
  FACTORY_CANNOT_FULFIL: "problem",
  QC_REJECTED: "problem",
};

/**
 * The 8 happy-path steps, each done / current / upcoming, with the date it
 * was reached. An order on an exception branch shows the exception in the
 * slot after the last step it reached — "the journey stopped here, because".
 */
export function buildOrderSteps(
  status: OrderStatus,
  history: StatusChange[],
  labelFor: (status: OrderStatus) => string = (s) => ORDER_STATUS[s].label,
): Step[] {
  const reached = reachedAt(history);
  const exception = EXCEPTION_STATE[status];

  const anchor = EXCEPTION_AFTER[status];
  const furthest = exception
    ? Math.max(
        anchor ? ORDER_HAPPY_PATH.indexOf(anchor) : -1,
        ...ORDER_HAPPY_PATH.map((step, i) => (reached.has(step) ? i : -1)),
      )
    : ORDER_HAPPY_PATH.indexOf(status);

  return ORDER_HAPPY_PATH.map((step, index) => {
    if (exception && index === furthest + 1) {
      return { label: labelFor(status), date: stepDate(reached, status), state: exception };
    }

    const state: StepState =
      index < furthest || (exception && index === furthest)
        ? "done"
        : index === furthest
          ? step === "CLOSED_OUT"
            ? "final"
            : "current"
          : "upcoming";

    return { label: labelFor(step), date: stepDate(reached, step), state };
  });
}
