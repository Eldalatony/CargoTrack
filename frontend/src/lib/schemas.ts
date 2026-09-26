import { z } from "zod";

import { parseAmount } from "./format";

/**
 * Form field rules shared by every form. Values stay strings while typed
 * (so "1,200.50" and half-typed numbers survive) and become numbers at submit.
 */

/** A required amount greater than zero; commas allowed. */
export const positiveAmount = (message = "Enter an amount greater than 0.") =>
  z
    .string()
    .trim()
    .refine((value) => parseAmount(value) > 0, message);

/** An optional amount: empty, or zero or more. */
export const optionalAmount = (message = "Enter a valid amount.") =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || parseAmount(value) >= 0, message);

/** A required whole number of at least `min`. */
export const wholeNumber = (min: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= min, message);

/** A required text value. */
export const requiredText = (message: string) => z.string().trim().min(1, message);
