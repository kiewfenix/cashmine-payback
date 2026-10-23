/**
 * Exact money math. Amounts are decimal strings at every boundary (API, UI) and BigInt
 * fixed-point inside: `units = amount × 10^decimals`, using the asset's own `decimals`.
 * No floats anywhere: ETH has 18 decimals, which a JS number cannot represent.
 */

/** The API's amount grammar: digits with an optional dot and more digits, no leading zeros. */
const AMOUNT_RE = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

export type ParseReason = "empty" | "format" | "too_many_decimals";
export type ParseResult = { ok: true; units: bigint } | { ok: false; reason: ParseReason };

/** Trims and turns a comma decimal separator (EU keyboards) into a dot. */
export function normalizeInput(input: string): string {
  return input.trim().replace(",", ".");
}

/** Parses user input into units, enforcing the API grammar and the asset's decimals. */
export function parseAmount(input: string, decimals: number): ParseResult {
  const text = normalizeInput(input);
  if (text === "") return { ok: false, reason: "empty" };
  const match = AMOUNT_RE.exec(text);
  if (!match) return { ok: false, reason: "format" };
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return { ok: false, reason: "too_many_decimals" };
  return { ok: true, units: BigInt(whole + fraction.padEnd(decimals, "0")) };
}

/**
 * Converts an amount the API sent into units. Accepts a leading minus (activity amounts are
 * signed). Throws, because a malformed server amount is a contract violation, not user error.
 */
export function toUnits(amount: string, decimals: number): bigint {
  const negative = amount.startsWith("-");
  const parsed = parseAmount(negative ? amount.slice(1) : amount, decimals);
  if (!parsed.ok) throw new Error(`Invalid amount "${amount}" for ${decimals} decimals (${parsed.reason})`);
  return negative ? -parsed.units : parsed.units;
}

export interface FormatOptions {
  /** Truncates (never rounds) the fraction to this many digits for display. */
  maxFractionDigits?: number;
}

/** Canonical decimal string: trailing zeros trimmed, never exponent form. */
export function formatUnits(units: bigint, decimals: number, options: FormatOptions = {}): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  let fraction = decimals === 0 ? "" : digits.slice(digits.length - decimals);
  if (options.maxFractionDigits !== undefined) fraction = fraction.slice(0, options.maxFractionDigits);
  fraction = fraction.replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${text}` : text;
}

export function add(a: bigint, b: bigint): bigint {
  return a + b;
}

export function sub(a: bigint, b: bigint): bigint {
  return a - b;
}

export function compare(a: bigint, b: bigint): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isZero(units: bigint): boolean {
  return units === 0n;
}

function fractionDigits(amount: string): number {
  const dot = amount.indexOf(".");
  return dot === -1 ? 0 : amount.length - dot - 1;
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

/** Integer division rounded half away from zero (half-up for the positive amounts we show). */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** USD value in cents, rounded half-up once. For display only; claim amounts are never rounded. */
export function mulToUsdCents(units: bigint, decimals: number, usdPrice: string): bigint {
  const priceDecimals = fractionDigits(usdPrice);
  const numerator = units * toUnits(usdPrice, priceDecimals);
  const scale = decimals + priceDecimals - 2; // cents = value × 100
  if (scale <= 0) return numerator * pow10(-scale);
  return divRoundHalfUp(numerator, pow10(scale));
}

export interface UsdItem {
  amount: string;
  decimals: number;
  usdPrice: string;
}

/** Total USD in cents: summed exactly, rounded once (so it can differ by a cent from adding rounded lines). */
export function sumUsdCents(items: UsdItem[]): bigint {
  let total = 0n;
  let scale = 0;
  for (const item of items) {
    const priceDecimals = fractionDigits(item.usdPrice);
    const itemScale = item.decimals + priceDecimals;
    const numerator = toUnits(item.amount, item.decimals) * toUnits(item.usdPrice, priceDecimals);
    if (itemScale > scale) {
      total = total * pow10(itemScale - scale) + numerator;
      scale = itemScale;
    } else {
      total += numerator * pow10(scale - itemScale);
    }
  }
  return divRoundHalfUp(total * 100n, pow10(scale));
}

/** "$1,234.56"; negative as "-$1,234.56". */
export function formatUsd(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${whole}.${fraction}`;
}

/** The fee is taken from the claimed amount: the user receives amount minus fee. */
export function computeReceive(amountUnits: bigint, feeUnits: bigint): bigint {
  return amountUnits - feeUnits;
}

export type ClaimAmountError =
  | ParseReason
  | "below_min"
  | "above_available"
  | "not_positive_after_fee";

export type ClaimAmountResult =
  | { ok: true; units: bigint; receive: bigint }
  | { ok: false; code: ClaimAmountError };

export interface ClaimAmountInput {
  input: string;
  decimals: number;
  minAmount: string;
  /** What the user may claim now (the server's `available`, minus anything already in flight). */
  available: string;
  fee: string;
}

/** Validates a claim amount against the API rules: grammar, decimals, min ≤ amount ≤ available, and a positive payout. */
export function validateClaimAmount(params: ClaimAmountInput): ClaimAmountResult {
  const parsed = parseAmount(params.input, params.decimals);
  if (!parsed.ok) return { ok: false, code: parsed.reason };
  const available = toUnits(params.available, params.decimals);
  const min = toUnits(params.minAmount, params.decimals);
  const fee = toUnits(params.fee, params.decimals);
  if (parsed.units > available) return { ok: false, code: "above_available" };
  if (parsed.units < min) return { ok: false, code: "below_min" };
  const receive = computeReceive(parsed.units, fee);
  if (receive <= 0n) return { ok: false, code: "not_positive_after_fee" };
  return { ok: true, units: parsed.units, receive };
}
