/** Display helpers. Formatting only — the API owns every calculation. */

export function money(amount: string | number | null | undefined, currency: string) {
  if (amount === null || amount === undefined) {
    return "—";
  }

  return `${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

export function dateTime(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}

/** ORDER_CONFIRMED -> Order confirmed */
export function label(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function decimal(value: string | null | undefined, digits = 3) {
  return value === null || value === undefined
    ? "—"
    : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
}
