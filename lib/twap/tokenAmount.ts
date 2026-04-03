"use client";

export const DEFAULT_TOKEN_DECIMALS = 6;

export function toRawAmount(
  displayAmount: string,
  decimals: number = DEFAULT_TOKEN_DECIMALS
): string {
  if (!displayAmount || displayAmount.trim() === "") return "0";
  const trimmed = displayAmount.trim();
  const numericAmount = Number(trimmed);
  if (!Number.isFinite(numericAmount) || numericAmount < 0) return "0";

  const [wholePartRaw, fractionalRaw = ""] = trimmed.split(".");
  const wholePart = wholePartRaw.replace(/^\+/, "") || "0";
  const cleanedFraction = fractionalRaw.replace(/[^0-9]/g, "");
  const fractionPart = decimals > 0
    ? cleanedFraction
        .slice(0, decimals)
        .padEnd(decimals, "0")
    : "";

  const multiplier = BigInt(10) ** BigInt(Math.max(0, decimals));
  const wholeBig = BigInt(wholePart || "0");
  const fractionBig = fractionPart ? BigInt(fractionPart) : BigInt(0);

  return (wholeBig * multiplier + fractionBig).toString();
}

type TokenWithDecimals = {
  exponent?: number | string | null;
  decimals?: number | string | null;
};

export function getTokenDecimals(
  token?: TokenWithDecimals,
  fallback: number = DEFAULT_TOKEN_DECIMALS
): number {
  if (!token) return fallback;
  const candidates = [token.exponent, token.decimals];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.floor(numeric));
    }
  }
  return fallback;
}

export function toDisplayAmount(rawAmount: string, decimals = 6): string {
  if (!rawAmount || rawAmount === "0") return "0";
  const numericAmount = Number(rawAmount);
  if (!Number.isFinite(numericAmount)) return "0";
  const displayMultiplier = Math.pow(10, decimals);
  return (numericAmount / displayMultiplier)
    .toFixed(decimals)
    .replace(/\.?0+$/, "");
}

export function isValidDisplayAmount(displayAmount: string): boolean {
  if (!displayAmount || displayAmount.trim() === "") return false;
  const numericAmount = Number(displayAmount);
  return Number.isFinite(numericAmount) && numericAmount > 0;
}

export function formatDisplayAmount(displayAmount: string, maxDecimals = 6) {
  if (!displayAmount || displayAmount === "0") return "0";
  const numericAmount = Number(displayAmount);
  if (!Number.isFinite(numericAmount)) return "0";
  return numericAmount.toFixed(maxDecimals).replace(/\.?0+$/, "");
}
