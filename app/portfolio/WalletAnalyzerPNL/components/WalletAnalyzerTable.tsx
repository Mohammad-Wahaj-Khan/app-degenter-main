"use client";

import { Copy } from "lucide-react";
import Image from "next/image";
import React from "react";
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "../../../config/chain";
import { type TradingTimeframe } from "./WalletAnalyzerBoxes";
import Profile from "@/public/star.svg";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

type TokenRow = {
  token: string;
  symbol: string;
  lastActive: string;
  alias: string;
  tokenBalance: string;
  position: string;
  totalPnl: string;
  totalPnlChange: string;
  realized: string;
  unrealized: string;
  bought: string;
  sold: string;
  net: string;
  avgBoughtSold: string;
  txs: string;
  holdDuration: string;
  imageUrl?: string | null;
  tokenBalanceValue: number;
  positionValueUsd: number;
  boughtUsd: number;
};

const normalizeWalletApiBase = (value?: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed || /undefined|null/i.test(trimmed)) return API_BASE_URL;
  return trimmed;
};

const PNL_API_ENDPOINTS = Array.from(
  new Set([normalizeWalletApiBase(process.env.NEXT_PUBLIC_API_BASE_URL)])
);

const LOW_VALUE_USD_THRESHOLD = 10;
const LOW_LIQUIDITY_USD_THRESHOLD = 5;

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
      const headers = new Headers(init.headers || undefined);
      const apiHeaders = new Headers(API_HEADERS || undefined);
      apiHeaders.forEach((value, key) => headers.set(key, value));
      const res = await fetch(url, {
        ...init,
        headers,
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

const formatTimeAgo = (dateString?: string) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "N/A";
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) return `${Math.max(0, diffSeconds)}s`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const formatTokenBalance = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
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

const formatCurrencyCompact = (value: number) => {
  if (!Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
};

const formatSignedCurrency = (value: number) => {
  if (!Number.isFinite(value)) return "N/A";
  if (value === 0) return formatCurrencyCompact(value);
  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatCurrencyCompact(Math.abs(value))}`;
};

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return "N/A";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${Math.abs(value).toFixed(2)}%`;
};

const formatPriceUsd = (value: number) => {
  if (!Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  }).format(value);
};

const formatHoldDurationMinutes = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0m";
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
};

const shortenTokenId = (value: string) => {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const badgeClass = (value: string) =>
  value.startsWith("-")
    ? "text-[#F64F39]"
    : value.startsWith("+")
    ? "text-[#20D87C]"
    : "text-white/70";

type WalletAnalyzerTableProps = {
  addressOverride?: string;
  timeframe: TradingTimeframe;
};

export default function WalletAnalyzerTable({
  addressOverride,
  timeframe,
}: WalletAnalyzerTableProps) {
  const { address: connectedAddress } = useChain(CHAIN_NAME || "zigchain-1");
  const address = addressOverride?.trim() || connectedAddress;
  const [tokenRows, setTokenRows] = React.useState<TokenRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hideLowLiquidity, setHideLowLiquidity] = React.useState(false);
  const [hideLowValue, setHideLowValue] = React.useState(false);
  const [hideZeroBalance, setHideZeroBalance] = React.useState(false);

  React.useEffect(() => {
    if (!address) {
      setTokenRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadRows = async () => {
      const win =
        timeframe === "1M" ? "30d" : (timeframe as string).toLowerCase();
      setLoading(true);
      setError(null);
      setTokenRows([]);

      try {
        const payload = await fetchFromEndpoints(
          PNL_API_ENDPOINTS,
          `/wallets/${encodeURIComponent(
            address
          )}/pnl/tokens?win=${encodeURIComponent(
            win
          )}&sort=total_pnl_desc&source=chain`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
          "wallet pnl tokens"
        );

        const items = Array.isArray(payload?.items) ? payload.items : [];
        const prepared = items.map((entry: any): TokenRow => {
          const token = entry?.token ?? {};
          const tokenId = token?.token_id ?? token?.tokenId ?? "";
          const symbol = token?.symbol ?? tokenId ?? "UNKNOWN";
          const tokenBalance = safeNumber(entry?.token_balance);
          const positionValue = safeNumber(entry?.position_value_usd);
          const totalPnlValue = safeNumber(entry?.total_pnl_usd);
          const realizedValue = safeNumber(entry?.realized_pnl_usd);
          const unrealizedValue = safeNumber(entry?.unrealized_pnl_usd);
          const boughtValue = safeNumber(entry?.bought_usd);
          const soldValue = safeNumber(entry?.sold_usd);
          const netValue = safeNumber(entry?.net_usd);
          const avgBuy = safeNumber(entry?.avg_buy_price_usd);
          const avgSell = safeNumber(entry?.avg_sell_price_usd);
          const pnlChange =
            boughtValue !== 0
              ? (totalPnlValue / Math.abs(boughtValue)) * 100
              : 0;

          return {
            token: symbol,
            symbol,
            lastActive: formatTimeAgo(entry?.last_active),
            alias: shortenTokenId(tokenId || symbol),
            tokenBalance: formatTokenBalance(tokenBalance),
            position: formatCurrencyCompact(positionValue),
            totalPnl: formatSignedCurrency(totalPnlValue),
            totalPnlChange: formatPercent(pnlChange),
            realized: formatSignedCurrency(realizedValue),
            unrealized: formatSignedCurrency(unrealizedValue),
            bought: formatCurrencyCompact(boughtValue),
            sold: formatCurrencyCompact(soldValue),
            net: formatSignedCurrency(netValue),
            avgBoughtSold: `${formatPriceUsd(avgBuy)} / ${formatPriceUsd(avgSell)}`,
            txs: `${entry?.txs_buy ?? 0} / ${entry?.txs_sell ?? 0}`,
            holdDuration: formatHoldDurationMinutes(
              safeNumber(entry?.hold_duration_sec)
            ),
            imageUrl: token?.image ?? null,
            tokenBalanceValue: tokenBalance,
            positionValueUsd: positionValue,
            boughtUsd: boughtValue,
          };
        });

        if (!active) return;
        setTokenRows(prepared);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load tokens";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadRows();

    return () => {
      active = false;
      controller.abort();
    };
  }, [address, timeframe]);

  const filteredRows = React.useMemo(() => {
    return tokenRows.filter((row) => {
      if (hideZeroBalance && row.tokenBalanceValue <= 0) return false;
      if (hideLowValue && row.positionValueUsd < LOW_VALUE_USD_THRESHOLD)
        return false;
      if (
        hideLowLiquidity &&
        row.boughtUsd < LOW_LIQUIDITY_USD_THRESHOLD &&
        row.positionValueUsd < LOW_LIQUIDITY_USD_THRESHOLD
      )
        return false;
      return true;
    });
  }, [tokenRows, hideLowLiquidity, hideLowValue, hideZeroBalance]);

  const renderTableRows = () => {
    if (!address) {
      return (
        <tr>
          <td colSpan={13} className="px-4 py-6 text-center text-white/60">
            Connect a wallet to view token PNL.
          </td>
        </tr>
      );
    }

    if (loading && !tokenRows.length) {
      return (
        <tr>
          <td colSpan={13} className="px-4 py-6 text-center text-white/60">
            Loading token PNL...
          </td>
        </tr>
      );
    }

    if (error && !tokenRows.length) {
      return (
        <tr>
          <td colSpan={13} className="px-4 py-6 text-center text-red-400">
            {error}
          </td>
        </tr>
      );
    }

    if (!filteredRows.length) {
      return (
        <tr>
          <td colSpan={13} className="px-4 py-6 text-center text-white/60">
            No tokens match the current filters.
          </td>
        </tr>
      );
    }

    return filteredRows.map((row) => (
      <tr
        key={`${row.alias}-${row.token}-${row.lastActive}`}
        className="border-b border-white/5 transition hover:bg-white/5"
      >
        <td className="px-4 py-3 border-b border-white/15">
          <div className="flex items-center gap-3">
            {row.imageUrl ? (
              <img
                src={row.imageUrl}
                alt={`${row.token} icon`}
                className="h-10 w-10 rounded-full object-cover"
                loading="lazy"
              />
            ) : (
              <Image
                src={Profile}
                alt="Profile icon"
                width={18}
                height={18}
                className="h-10 w-10 rounded-full"
                unoptimized
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-white">
                  {row.token}
                </span>
                {/* <button className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white/60 transition hover:border-[#39C8A6]">
                  <Copy className="h-3 w-3" />
                </button> */}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#0F483A] px-3 py-0.5 text-[11px] text-white/80">
                  {row.lastActive}
                </span>
                {/* <span className="text-[13px] font-semibold text-[#8F8FFF]">
                  {row.alias}
                </span> */}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15 text-white">
          {row.tokenBalance}
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15 text-white">
          {row.position}
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15">
          <div className={`text-sm font-semibold ${badgeClass(row.totalPnl)}`}>
            {row.totalPnl}
          </div>
          <span className="block text-[11px] text-white/60">
            {row.totalPnlChange}
          </span>
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15">
          <div className={`text-sm font-semibold ${badgeClass(row.realized)}`}>
            {row.realized}
          </div>
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15">
          <div className={`text-sm font-semibold ${badgeClass(row.unrealized)}`}>
            {row.unrealized}
          </div>
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15 text-white">
          {row.bought}
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15 text-white">
          {row.sold}
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15">
          <div className={`text-sm font-semibold ${badgeClass(row.net)}`}>
            {row.net}
          </div>
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15 text-white">
          {row.avgBoughtSold}
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15 text-white">
          {row.txs}
        </td>
        <td className="px-4 py-3 text-center border-b border-white/15 text-white">
          {row.holdDuration}
        </td>
        {/* <td className="px-4 py-3 text-center border-b border-white/15">
          <div className="flex items-center justify-center gap-2">
            <button className="h-8 w-8 rounded-full border border-white/20 bg-black/40 text-xs text-white/70">
              ↻
            </button>
            <button className="h-8 w-8 rounded-full border border-white/20 bg-black/40 text-xs text-white/70">
              ⚡
            </button>
          </div>
        </td> */}
      </tr>
    ));
  };

  const totalRows = filteredRows.length;
  const rowsLabel = totalRows ? `1-${totalRows}` : "0-0";
  const checkboxOptions = [
    {
      label: "Hide Low Liqu/Scam",
      checked: hideLowLiquidity,
      onChange: (checked: boolean) => setHideLowLiquidity(checked),
    },
    {
      label: "Hide Low Value",
      checked: hideLowValue,
      onChange: (checked: boolean) => setHideLowValue(checked),
    },
    {
      label: "Hide Zero Balance",
      checked: hideZeroBalance,
      onChange: (checked: boolean) => setHideZeroBalance(checked),
    },
  ];

  return (
    <div className="w-full">
      <section className="w-full rounded-[32px] text-white">
        <div className="flex flex-col gap-3 px-4 md:px-0 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.4em] text-white/50">Tokens Traded</p>
            <h2 className="text-2xl font-semibold tracking-tight">Tokens Traded</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/80">
            {checkboxOptions.map((option) => (
              <label
                key={option.label}
                className="flex items-center gap-2  text-[11px] uppercase tracking-[0.3em]"
              >
                <input
                  type="checkbox"
                  checked={option.checked}
                  onChange={(event) => option.onChange(event.target.checked)}
                  className="h-3 w-3 rounded border border-[#32816E] bg-transparent accent-[#32816E]"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
{/* bg-gradient-to-br from-[#030303] via-[#05130d] to-[#0b2a1c] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.8)] */}
        <div className="my-6 relative z-10 mx-auto w-full rounded-xl overflow-hidden border border-white/20 shadow-[0_20px_80px_rgba(0,0,0,0.8)] "
            style={{
                // backgroundImage: `radial-gradient(circle at 80% 96%, rgba(35, 153, 125, 0.45), #05130d 55%), linear-gradient(160deg, #050505 35%, #050505 70%, #020a0b 100%)`,
                backgroundImage: `radial-gradient(circle at 80% 96%, #851400ff, #140401ff 55%), linear-gradient(160deg, #050505 35%, #050505 70%, #020a0b 100%)`,
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
            }}
        >
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-separate border-spacing-0 text-left text-[13px] mx-auto">
              <thead className="bg-[#000000]/50 text-white/70 relative border-b border-white/20  text-gray-400 text-xs uppercase tracking-wider after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-gradient-to-r after:from-[#FA4E30] after:to-[#39C8A6] after:content-[''] pb-4 md:flex-row md:items-center">
                <tr>
                  <th className="px-4 py-3">Token / Last active</th>
                  <th className="px-4 py-3 text-center">Token Bal</th>
                  <th className="px-4 py-3 text-center">Position</th>
                  <th className="px-4 py-3 text-center">Total PNL</th>
                  <th className="px-4 py-3 text-center">Realized</th>
                  <th className="px-4 py-3 text-center">Unrealized</th>
                  <th className="px-4 py-3 text-center">Bought</th>
                  <th className="px-4 py-3 text-center">Sold</th>
                  <th className="px-4 py-3 text-center">Net</th>
                  <th className="px-4 py-3 text-center">Avg Bought/Sold</th>
                  <th className="px-4 py-3 text-center">TXS</th>
                  <th className="px-4 py-3 text-center">Hold dur</th>
                  {/* <th className="px-4 py-3 text-center">Actions</th> */}
                </tr>
              </thead>
              <tbody>{renderTableRows()}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-[12px] text-white/50">
            <span>Showing rows {rowsLabel} of {totalRows}</span>
            <span className="rounded-full border border-white/20 px-3 py-1 text-[11px] uppercase tracking-[0.4em]">
              Page 1/1
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
