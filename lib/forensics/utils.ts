const COMMON_DENOM_MAP: Record<string, { symbol: string; decimals: number }> = {
  uzig: { symbol: "ZIG", decimals: 6 },
  uusdc: { symbol: "USDC", decimals: 6 },
  uusdt: { symbol: "USDT", decimals: 6 },
  uatom: { symbol: "ATOM", decimals: 6 },
  uosmo: { symbol: "OSMO", decimals: 6 },
};

export const HOT_WALLET_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  zig1tm9hckgnq23f03f8ts00eazwdr2fw6x7yy5elk: {
    label: "Bybit",
    color: "#f7a600",
  },
  zig1455xp0cwksuug8jclrajrt3x0yzf6v08dpx0nf: {
    label: "Kucoin",
    color: "rgb(16, 220, 158)",
  },
  zig18slm0etzj57x96a0sevdhlr7v6v0zwfzxmwr9n: {
    label: "MEXC",
    color: "#04B7F8",
  },
};

export const getHotWalletInfo = (address: string) => {
  if (!address) return null;
  return HOT_WALLET_LABELS[address] || null;
};

export const getAddressByLabel = (label: string): string | null => {
  if (!label) return null;
  const normalized = label.trim().toLowerCase();
  const found = Object.entries(HOT_WALLET_LABELS).find(
    ([, info]) => info.label.toLowerCase() === normalized,
  );
  return found ? found[0] : null;
};

export const formatHighPrecisionAmount = (
  amount: string | number | null | undefined,
  decimals: number,
): string => {
  if (amount === null || amount === undefined || amount === "") return "0.00";

  let strAmount = amount.toString().trim();
  let integerPart: string;
  let fractionalPart: string;

  if (strAmount.includes(".")) {
    const [int, frac] = strAmount.split(".");
    integerPart = int || "0";
    fractionalPart = frac || "";
  } else {
    strAmount = strAmount.replace(/[^0-9]/g, "");
    if (!strAmount) return "0.00";

    if (decimals === 0) {
      try {
        return new Intl.NumberFormat().format(BigInt(strAmount));
      } catch {
        return strAmount;
      }
    }

    if (strAmount.length > decimals) {
      integerPart = strAmount.slice(0, strAmount.length - decimals);
      fractionalPart = strAmount.slice(strAmount.length - decimals);
    } else {
      integerPart = "0";
      fractionalPart = strAmount.padStart(decimals, "0");
    }
  }

  const firstNonZero = fractionalPart.search(/[1-9]/);
  const fractionalLength = firstNonZero === -1 ? 2 : Math.max(2, firstNonZero + 2);
  const displayFractional =
    firstNonZero === -1
      ? "00"
      : fractionalPart.slice(0, fractionalLength).padEnd(fractionalLength, "0");

  let formattedInteger: string;
  try {
    formattedInteger = new Intl.NumberFormat().format(BigInt(integerPart));
  } catch {
    formattedInteger = integerPart;
  }

  return `${formattedInteger}.${displayFractional}`;
};

export const formatTimestamp = (timestamp: string | number) => {
  if (timestamp === undefined || timestamp === null) return "";
  const normalized = timestamp.toString().trim();
  const hasTimezone =
    /[+-]\d{2}:?\d{2}$/.test(normalized) || /[zZ]$/.test(normalized);
  const isoString = hasTimezone
    ? normalized
    : normalized.replace(" ", "T") + "Z";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

export const formatRelativeTime = (
  timestamp: string | number,
  nowOverride?: number,
): string => {
  const nowMs = nowOverride ?? Date.now();
  const normalized = timestamp.toString().trim();
  const hasTimezone =
    /[+-]\d{2}:?\d{2}$/.test(normalized) || /[zZ]$/.test(normalized);
  const isoString = hasTimezone
    ? normalized
    : normalized.replace(" ", "T") + "Z";

  let date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    const unixTimestamp = parseInt(timestamp.toString(), 10);
    if (!Number.isNaN(unixTimestamp)) {
      date = new Date(unixTimestamp > 1e12 ? unixTimestamp : unixTimestamp * 1000);
    }
  }

  if (Number.isNaN(date.getTime())) return "just now";

  const diffInSeconds = Math.floor((nowMs - date.getTime()) / 1000);
  if (diffInSeconds < 0) return "just now";
  if (diffInSeconds < 60) return diffInSeconds <= 1 ? "1 sec ago" : `${diffInSeconds} secs ago`;

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return diffInMinutes === 1 ? "1 min ago" : `${diffInMinutes} mins ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return diffInHours === 1 ? "1 hour ago" : `${diffInHours} hours ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return diffInDays === 1 ? "1 day ago" : `${diffInDays} days ago`;

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return diffInMonths === 1 ? "1 month ago" : `${diffInMonths} months ago`;

  const diffInYears = Math.floor(diffInDays / 365);
  return diffInYears === 1 ? "1 year ago" : `${diffInYears} years ago`;
};

export const formatDenom = (denom: string) => {
  if (!denom) return "";
  const baseDenom = denom.includes("/") ? denom.split("/").pop() || denom : denom;
  if (COMMON_DENOM_MAP[baseDenom]) return COMMON_DENOM_MAP[baseDenom].symbol;
  if (denom.startsWith("ibc/")) {
    return `${denom.substring(4, 12)}...${denom.substring(denom.length - 4)}`;
  }
  if (denom.length <= 12) return denom;
  return `${denom.substring(0, 6)}...${denom.substring(denom.length - 6)}`;
};
