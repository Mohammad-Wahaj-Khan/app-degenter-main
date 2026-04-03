"use client";


import React from "react";
import { Copy, Check, Image as ImageIcon } from "lucide-react";
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "../../../config/chain";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";


const normalizeWalletApiBase = (value?: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed || /undefined|null/i.test(trimmed)) return API_BASE_URL;
  return trimmed;
};

const HOLDINGS_API_ENDPOINTS = Array.from(
  new Set([normalizeWalletApiBase(process.env.NEXT_PUBLIC_WALLET_HOLDINGS_API)])
);


const COLOR_PALETTE = [
  "#047857",
  "#065f46",
  "#0f766e",
  "#0ea5e9",
  "#6366f1",
  "#8067ee",
  "#db2777",
  "#f97316",
  "#14b8a6",
];


const safeNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};


const buildUrl = (base: string, path: string) => {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
};


const fetchFromEndpoints = async (
  endpoints: string[],
  path: string,
  init: RequestInit = {},
  label: string
) => {
  let lastError: string | null = null;
  for (const endpoint of endpoints) {
    try {
      const url = buildUrl(endpoint, path);
      const res = await fetch(url, {
        ...init,
        headers: { ...API_HEADERS, ...(init.headers || {}) },
      });
      if (res.ok) {
        return res.json();
      }
      lastError = `HTTP ${res.status} ${res.statusText}`;
    } catch (err) {
      lastError =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "request failed";
    }
  }
  throw new Error(
    lastError
      ? `Unable to load ${label} (${lastError})`
      : `Unable to load ${label}`
  );
};


const formatUsdValue = (value?: number) => {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
};

const formatZigValue = (value?: number) => {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 6,
  }).format(value);
  return `${formatted} ZIG`;
};


const formatBalanceValue = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 6,
      minimumFractionDigits: 0,
    }).format(value);
  }
  if (Math.abs(value) < 1) {
    return value.toFixed(4).replace(/\.?0+$/, "");
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  }).format(value);
};


const shortenDenom = (denom: string) => {
  if (!denom) return "";
  if (denom.length <= 12) return denom;
  return `${denom.slice(0, 6)}...${denom.slice(-4)}`;
};


const formatTimeAgo = (elapsedMs: number) => {
  const safeMs = Math.max(0, Math.floor(elapsedMs));
  const seconds = Math.floor(safeMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
};


const formatTokenName = (name: string) => {
  if (!name) return "";
  if (!name.includes(".")) return name;
  const parts = name.split(".");
  const lastPart = parts[parts.length - 1];
  return lastPart ? lastPart.toUpperCase() : name;
};


const deriveIconColor = (seed: string) => {
  const text = seed || "zig";
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
};


interface TokenData {
  id: string;
  name: string;
  addressShort: string;
  copyValue: string;
  timeAgo: string;
  price: string;
  balance: string;
  usdValue: string;
  iconColor: string;
  iconUri?: string;
}


interface TokenDataWithSort extends TokenData {
  sortValue: number;
}


const TokenRow = ({ data }: { data: TokenData }) => {
  const [copied, setCopied] = React.useState(false);


  const handleCopy = () => {
    navigator.clipboard.writeText(data.copyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  return (
    <div className="flex flex-col gap-3 border-b border-white/5 px-4 py-4 transition-colors hover:bg-white/5 md:grid md:grid-cols-[1.5fr_1fr_1fr_1fr] md:items-center">
      <div className="flex flex-col gap-2">
        <span className="md:hidden text-[10px] uppercase tracking-[0.4em] text-gray-500">
          Tokens
        </span>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-white/5"
            style={{
              backgroundColor:
                data.iconUri?.toLowerCase().includes("zigicon") ||
                data.name.toUpperCase() === "ZIG"
                  ? undefined
                  : data.iconColor,
            }}
          >
            {data.iconUri ? (
              <img
                src={data.iconUri}
                alt={`${data.name} icon`}
                className="w-full h-full object-cover rounded-full"
                loading="lazy"
              />
            ) : (
              <ImageIcon size={16} className="text-gray-500 opacity-50" />
            )}
          </div>


          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-gray-200 text-sm">
                {data.name}
              </span>
              {copied ? (
                <Check size={12} className="text-green-500" />
              ) : (
                <Copy
                  size={12}
                  className="text-gray-500 cursor-pointer hover:text-gray-300"
                  onClick={handleCopy}
                />
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="bg-[#0f2e22] text-[#4ade80] text-[10px] font-bold px-1 py-0.5 rounded leading-none">
                {data.timeAgo}
              </span>
              <span className="text-[#3b82f6] text-[12px] cursor-pointer hover:underline">
                {data.addressShort}
              </span>
            </div>
          </div>
        </div>
      </div>


      <div className="flex flex-col gap-1">
        <span className="md:hidden text-[10px] uppercase tracking-[0.4em] text-gray-500">
          Price (USD)
        </span>
        <span className="text-gray-200 font-medium text-sm">{data.price}</span>
      </div>


      <div className="flex flex-col gap-1">
        <span className="md:hidden text-[10px] uppercase tracking-[0.4em] text-gray-500">
          Balance
        </span>
        <span className="text-gray-200 font-medium text-sm">
          {data.balance}
        </span>
      </div>


      <div className="flex flex-col gap-1">
        <span className="md:hidden text-[10px] uppercase tracking-[0.4em] text-gray-500">
          ZIG Value
        </span>
        <span className="text-gray-200 font-medium text-sm">
          {data.usdValue}
        </span>
      </div>
    </div>
  );
};


type CurrentHoldingProps = {
  addressOverride?: string;
};

export default function CurrentHolding({ addressOverride }: CurrentHoldingProps) {
  const { address: connectedAddress } = useChain(CHAIN_NAME || "zigchain-1");
  const address = addressOverride?.trim() || connectedAddress;
  const [holdings, setHoldings] = React.useState<TokenData[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);


  React.useEffect(() => {
    if (!address) {
      setHoldings([]);
      setError(null);
      setLoading(false);
      return;
    }


    const controller = new AbortController();
    let active = true;


    const loadHoldings = async () => {
      setLoading(true);
      setError(null);
      const fetchStart = Date.now();


      try {
        const holdingsPayload = await fetchFromEndpoints(
          HOLDINGS_API_ENDPOINTS,
          `wallets/${encodeURIComponent(address)}/portfolio/holdings?source=chain`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
          "wallet holdings"
        );

        const items = Array.isArray(holdingsPayload?.items)
          ? holdingsPayload.items
          : [];
        const asOf =
          typeof holdingsPayload?.as_of === "string"
            ? Date.parse(holdingsPayload.as_of)
            : Number.NaN;
        const timeAgoLabel = formatTimeAgo(
          Date.now() - (Number.isFinite(asOf) ? asOf : fetchStart)
        );

        const prepared = items
          .map((entry: any): TokenDataWithSort | null => {
            const token = entry?.token ?? {};
            const denom =
              token?.denom ??
              token?.token_id ??
              token?.tokenId ??
              token?.symbol ??
              "unknown";
            const symbol = token?.symbol ?? denom;
            const displayName = formatTokenName(symbol);
            const balance = safeNumber(entry?.balance);
            if (balance <= 0) return null;
            const priceUsd = safeNumber(entry?.price_usd ?? entry?.priceUsd);
            const usdValue = safeNumber(entry?.value_usd ?? entry?.valueUsd);
            const iconUri =
              token?.image ?? token?.imageUri ?? token?.imageURI;
            return {
              id: denom,
              name: displayName || denom,
              addressShort: shortenDenom(denom),
              copyValue: denom,
              timeAgo: timeAgoLabel,
              price: priceUsd > 0 ? formatUsdValue(priceUsd) : "—",
              balance: formatBalanceValue(balance),
              usdValue: usdValue > 0 ? formatZigValue(usdValue) : "—",
              iconColor: deriveIconColor(displayName || denom),
              iconUri,
              sortValue: usdValue,
            };
          })
          .filter((item: any): item is TokenDataWithSort => Boolean(item))
          .sort((a: { sortValue: number; }, b: { sortValue: number; }) => b.sortValue - a.sortValue);

        if (!active) return;
        setHoldings(
          prepared.map(({ sortValue, ...rest }: TokenDataWithSort) => rest)
        );
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load holdings";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };


    loadHoldings();


    return () => {
      active = false;
      controller.abort();
    };
  }, [address]);


  const renderBodyContent = () => {
    if (!address) {
      return (
        <div className="px-4 py-6 text-center text-gray-400">
          Connect a wallet to display your holdings.
        </div>
      );
    }


    if (loading && !holdings.length) {
      return (
        <div className="px-4 py-6 text-center text-gray-400">
          Loading portfolio...
        </div>
      );
    }


    if (error && !holdings.length) {
      return <div className="px-4 py-6 text-center text-red-400">{error}</div>;
    }


    if (!holdings.length) {
      return (
        <div className="px-4 py-6 text-center text-gray-400">
          No assets detected for this wallet.
        </div>
      );
    }


    return holdings.map((item) => <TokenRow key={item.id} data={item} />);
  };


  return (
    <div className="w-full mt-3 mb-6">
      <h2 className="text-md font-bold mb-4 ml-1">CURRENT HOLDING</h2>
      <div
        className="my-6 relative z-10 mx-auto w-full rounded-xl overflow-hidden border border-white/20 shadow-[0_20px_80px_rgba(0,0,0,0.8)]"
        style={{
                backgroundImage: `radial-gradient(circle at 80% 96%, #851400ff, #140401ff 55%), linear-gradient(160deg, #050505 35%, #050505 70%, #020a0b 100%)`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="absolute top-0 left-0 w-1/3 h-full pointer-events-none" />


        <div className="hidden md:block overflow-x-auto no-scrollbar">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] px-4 md:px-6 py-4 relative border-b border-white/20 bg-[#000000]/50 text-gray-400 text-xs font-semibold uppercase tracking-wider relative z-10">
            <div>Tokens</div>
            <div>Price (USD)</div>
            <div>Balance</div>
            <div>ZIG Value</div>
          </div>
        </div>


        <div className="relative z-10">{renderBodyContent()}</div>


        {/* <div className="flex flex-col sm:flex-row justify-between sm:justify-end items-center gap-2 px-4 md:px-6 py-4 text-[11px] text-gray-500 relative z-10">
          <div>Showing pairs 1-100 of 179,950</div>
          <div className="bg-black text-white px-2 py-1 rounded flex items-center gap-1 cursor-pointer hover:bg-white/10 transition-colors">
            Pairs 1-100
          </div>
        </div> */}
      </div>
    </div>
  );
}
