/** Display helpers. Formatting only — the API owns every calculation. */

/** 12000 -> "12,000.00" */
export function amount(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 12000, "USD" -> "12,000.00 USD" */
export function money(
  value: string | number | null | undefined,
  currency: string,
) {
  return value === null || value === undefined
    ? "—"
    : `${amount(value)} ${currency}`;
}

/** 25/09/2026 */
export function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}

/** 25/09/2026 09:14 */
export function dateTime(value: string | null | undefined) {
  return value
    ? new Date(value)
        .toLocaleString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
        .replace(",", "")
    : "—";
}

/** 14 Sep — for step labels, where the year is obvious. */
export function shortDate(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      })
    : "";
}

/** 14:32 */
export function time(value: number | string | Date) {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ORDER_CONFIRMED -> Order confirmed */
export function label(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function decimal(value: string | number | null | undefined, digits = 3) {
  return value === null || value === undefined
    ? "—"
    : Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
}

/**
 * Orders carry a UUID only; the first 8 characters are enough to tell them
 * apart on screen and are shown in mono, like any other reference.
 */
export function shortId(id: string) {
  return id.slice(0, 8);
}

/** "Amira Rashad" -> "AR" */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** "1,200.50" -> 1200.5; anything unparsable -> NaN */
export function parseAmount(value: string) {
  return Number(value.replace(/,/g, "").trim());
}
