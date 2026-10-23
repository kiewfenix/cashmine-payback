import { describe, expect, it } from "@jest/globals";

import {
  compare,
  computeReceive,
  formatUnits,
  formatUsd,
  isZero,
  mulToUsdCents,
  parseAmount,
  sub,
  sumUsdCents,
  toUnits,
  validateClaimAmount,
} from "../money";

const USDT = 6;
const ETH = 18;

describe("parseAmount", () => {
  it("accepts the API grammar", () => {
    expect(parseAmount("0.5", USDT)).toEqual({ ok: true, units: 500000n });
    expect(parseAmount("12", USDT)).toEqual({ ok: true, units: 12000000n });
    expect(parseAmount("0", USDT)).toEqual({ ok: true, units: 0n });
    expect(parseAmount("100.000001", USDT)).toEqual({ ok: true, units: 100000001n });
  });

  it("rejects what the API rejects", () => {
    for (const bad of [".5", "1.", "05", "1e-3", "-1", "1,000.5", "abc", "1.2.3", "+1", "0x10"]) {
      expect(parseAmount(bad, USDT)).toEqual({ ok: false, reason: "format" });
    }
  });

  it("treats blank input as empty, not as a format error", () => {
    expect(parseAmount("", USDT)).toEqual({ ok: false, reason: "empty" });
    expect(parseAmount("   ", USDT)).toEqual({ ok: false, reason: "empty" });
  });

  it("accepts a comma as the decimal separator and trims whitespace", () => {
    expect(parseAmount("1,5", USDT)).toEqual({ ok: true, units: 1500000n });
    expect(parseAmount("  2.25 ", USDT)).toEqual({ ok: true, units: 2250000n });
  });

  it("enforces the asset's decimals", () => {
    expect(parseAmount("1.123456", USDT)).toEqual({ ok: true, units: 1123456n });
    expect(parseAmount("1.1234567", USDT)).toEqual({ ok: false, reason: "too_many_decimals" });
    expect(parseAmount("0.000000000000000001", ETH)).toEqual({ ok: true, units: 1n });
    expect(parseAmount("0.0000000000000000001", ETH)).toEqual({ ok: false, reason: "too_many_decimals" });
  });
});

describe("toUnits", () => {
  it("accepts signed server amounts", () => {
    expect(toUnits("-9.81", USDT)).toBe(-9810000n);
    expect(toUnits("9.81", USDT)).toBe(9810000n);
  });

  it("throws on a malformed server amount", () => {
    expect(() => toUnits("1.", USDT)).toThrow();
    expect(() => toUnits("1.1234567", USDT)).toThrow();
  });
});

describe("18-decimal ETH values", () => {
  const balance = "12.345678901234591676";

  it("are exact where a JS number is not", () => {
    expect(String(Number(balance))).not.toBe(balance);
    const result = sub(toUnits(balance, ETH), toUnits("0.000000000000000001", ETH));
    expect(formatUnits(result, ETH)).toBe("12.345678901234591675");
  });

  it("round-trip through formatUnits unchanged", () => {
    expect(formatUnits(toUnits(balance, ETH), ETH)).toBe(balance);
  });
});

describe("formatUnits", () => {
  it("trims trailing zeros and never uses exponent form", () => {
    expect(formatUnits(500000n, USDT)).toBe("0.5");
    expect(formatUnits(12000000n, USDT)).toBe("12");
    expect(formatUnits(0n, USDT)).toBe("0");
    expect(formatUnits(1n, ETH)).toBe("0.000000000000000001");
    expect(formatUnits(10n ** 25n, 0)).toBe("10000000000000000000000000");
  });

  it("truncates instead of rounding when maxFractionDigits is given", () => {
    expect(formatUnits(toUnits("12.3456789099", 10), 10, { maxFractionDigits: 8 })).toBe("12.3456789");
    expect(formatUnits(toUnits("12.3456789099", 10), 10, { maxFractionDigits: 2 })).toBe("12.34");
    expect(formatUnits(toUnits("0.000000009", 9), 9, { maxFractionDigits: 8 })).toBe("0");
  });

  it("keeps the sign", () => {
    expect(formatUnits(-9810000n, USDT)).toBe("-9.81");
  });
});

describe("compare and isZero", () => {
  it("orders units", () => {
    expect(compare(1n, 2n)).toBe(-1);
    expect(compare(2n, 1n)).toBe(1);
    expect(compare(2n, 2n)).toBe(0);
    expect(isZero(0n)).toBe(true);
    expect(isZero(1n)).toBe(false);
  });
});

describe("USD", () => {
  it("multiplies exactly and rounds half-up to cents once", () => {
    expect(mulToUsdCents(toUnits("2", USDT), USDT, "1.005")).toBe(201n);
    expect(mulToUsdCents(toUnits("1", USDT), USDT, "0.005")).toBe(1n); // 0.5 cent rounds up
    expect(mulToUsdCents(toUnits("1", USDT), USDT, "0.004")).toBe(0n);
    expect(mulToUsdCents(toUnits("3", USDT), USDT, "0.3333")).toBe(100n); // 0.9999 → $1.00
    expect(mulToUsdCents(toUnits("0.1", 1), 1, "3")).toBe(30n); // scale below cents
  });

  it("values the sample balances from the API docs", () => {
    expect(formatUsd(mulToUsdCents(toUnits("820.413207", USDT), USDT, "1.0002"))).toBe("$820.58");
    expect(formatUsd(mulToUsdCents(toUnits("0.5", ETH), ETH, "2461.08"))).toBe("$1,230.54");
  });

  it("sums exactly before rounding", () => {
    const items = [
      { amount: "1", decimals: USDT, usdPrice: "0.005" },
      { amount: "1", decimals: USDT, usdPrice: "0.005" },
    ];
    expect(sumUsdCents(items)).toBe(1n); // exact 0.01, not 2 cents from rounding each line
    expect(sumUsdCents([])).toBe(0n);
  });

  it("sums assets with different decimals", () => {
    const items = [
      { amount: "2", decimals: USDT, usdPrice: "1" },
      { amount: "0.5", decimals: ETH, usdPrice: "2000" },
      { amount: "0.01", decimals: 8, usdPrice: "60000.5" },
    ];
    expect(formatUsd(sumUsdCents(items))).toBe("$1,602.01"); // 2 + 1000 + 600.005 → half-up
  });

  it("formats cents with grouping and sign", () => {
    expect(formatUsd(123456789n)).toBe("$1,234,567.89");
    expect(formatUsd(5n)).toBe("$0.05");
    expect(formatUsd(0n)).toBe("$0.00");
    expect(formatUsd(-5n)).toBe("-$0.05");
  });
});

describe("computeReceive", () => {
  it("takes the fee from the claimed amount", () => {
    const receive = computeReceive(toUnits("0.5", ETH), toUnits("0.0012", ETH));
    expect(formatUnits(receive, ETH)).toBe("0.4988");
  });
});

describe("validateClaimAmount", () => {
  const rules = { decimals: USDT, minAmount: "0.01", available: "820.413207", fee: "0.001" };

  it("accepts the boundaries", () => {
    expect(validateClaimAmount({ ...rules, input: "0.01" })).toEqual({ ok: true, units: 10000n, receive: 9000n });
    expect(validateClaimAmount({ ...rules, input: "820.413207" })).toEqual({
      ok: true,
      units: 820413207n,
      receive: 820412207n,
    });
  });

  it("rejects one unit outside the boundaries", () => {
    expect(validateClaimAmount({ ...rules, input: "0.009999" })).toEqual({ ok: false, code: "below_min" });
    expect(validateClaimAmount({ ...rules, input: "820.413208" })).toEqual({ ok: false, code: "above_available" });
  });

  it("passes parse errors through", () => {
    expect(validateClaimAmount({ ...rules, input: "" })).toEqual({ ok: false, code: "empty" });
    expect(validateClaimAmount({ ...rules, input: "1." })).toEqual({ ok: false, code: "format" });
    expect(validateClaimAmount({ ...rules, input: "1.1234567" })).toEqual({ ok: false, code: "too_many_decimals" });
  });

  it("rejects amounts that would pay out nothing after the fee", () => {
    const tinyMin = { decimals: USDT, minAmount: "0.001", available: "10", fee: "0.002" };
    expect(validateClaimAmount({ ...tinyMin, input: "0.002" })).toEqual({ ok: false, code: "not_positive_after_fee" });
    expect(validateClaimAmount({ ...tinyMin, input: "0.0015" })).toEqual({ ok: false, code: "not_positive_after_fee" });
    expect(validateClaimAmount({ ...tinyMin, input: "0.003" })).toEqual({ ok: true, units: 3000n, receive: 1000n });
  });

  it("accepts a comma from a phone keyboard", () => {
    expect(validateClaimAmount({ ...rules, input: "1,5" })).toEqual({ ok: true, units: 1500000n, receive: 1499000n });
  });
});
