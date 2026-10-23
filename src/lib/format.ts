import { formatUnits, formatUsd, mulToUsdCents, toUnits } from "./money";

/** Crypto amount for lists: up to `maxFractionDigits`, trailing zeros trimmed. Falls back to the raw string on bad input. */
export function formatAmount(amount: string, decimals: number, maxFractionDigits = 8): string {
  try {
    return formatUnits(toUnits(amount, decimals), decimals, { maxFractionDigits });
  } catch {
    return amount;
  }
}

/** USD value of an amount, or "—" when it can't be computed. */
export function formatAmountUsd(amount: string, decimals: number, usdPrice: string): string {
  try {
    return formatUsd(mulToUsdCents(toUnits(amount, decimals), decimals, usdPrice));
  } catch {
    return "—";
  }
}

/** "19:20:26" in the viewer's locale. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** "19:20" in the viewer's locale. */
export function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "23 Oct, 19:20" in the viewer's locale. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Whole seconds between `iso` and `now`, never negative (server clocks can run ahead). */
export function secondsSince(iso: string, now: number): number {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((now - time) / 1_000));
}
