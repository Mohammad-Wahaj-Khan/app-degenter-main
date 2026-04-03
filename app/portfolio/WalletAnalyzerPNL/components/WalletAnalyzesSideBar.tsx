"use client";

import React, { useEffect, useState } from "react";
import { ClipboardCopy, Pencil, Star } from "lucide-react";
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "../../../config/chain";
import ProfileImg from "@/public/profileimg.svg";
import Whale from "@/public/whale.svg";
import Airdrop from "@/public/airdrop.svg";
import Hacker from "@/public/hacker.svg";
import Stars from "@/public/star.svg";
import Image, { type StaticImageData } from "next/image";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";
import {
  fetchProfileByWallet,
  getSocialTagsFromProfile,
  type ProfileData,
} from "../lib/profile";

interface ChartDataPoint {
  t: string;
  value_usd: number;
}

interface WalletValueResponse {
  tf: string;
  points: ChartDataPoint[];
  mdd_pct: number;
  source: string;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const socialTagImages: Record<string, StaticImageData> = {
  "Airdrop Farmer": Airdrop,
  Whale: Whale,
  "Smart Trader": Stars,
  Hacker: Hacker,
};

const normalizeWalletApiBase = (value?: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed || /undefined|null/i.test(trimmed)) return API_BASE_URL;
  return trimmed;
};

const HOLDINGS_API_ENDPOINTS = Array.from(
  new Set([normalizeWalletApiBase(process.env.NEXT_PUBLIC_WALLET_HOLDINGS_API)])
);

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

const formatCurrencyCompact = (value: number) => {
  if (!Number.isFinite(value)) return "N/A";

  // Format the number with compact notation
  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  // Format the number and add $ sign
  return `$${formatter.format(value)}`;
};

const formatWalletAddress = (value?: string) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "No wallet selected";
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
};

type WalletAnalyzerSidebarProps = {
  addressOverride?: string;
};

export default function WalletAnalyzerSidebar({
  addressOverride,
}: WalletAnalyzerSidebarProps) {
  const { address: connectedAddress } = useChain(CHAIN_NAME || "zigchain-1");
  const address = addressOverride?.trim() || connectedAddress;
  const [walletValue, setWalletValue] = useState(0);
  const [loadingValue, setLoadingValue] = useState(false);
  const [valueError, setValueError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{ time: string; value: number }[]>(
    []
  );
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});
  const [loadingWhaleCount, setLoadingWhaleCount] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Load profile data when address changes
  useEffect(() => {
    const loadProfile = async () => {
      if (!address) {
        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      try {
        setLoadingProfile(true);
        const profileData = await fetchProfileByWallet(address);
        setProfile(profileData);
      } catch (error) {
        console.error("Error loading profile:", error);
        setProfile(null);
      } finally {
        setLoadingProfile(false);
      }
    };

    loadProfile();
  }, [address]);

  // Load wallet value and chart data
  useEffect(() => {
    if (!address) {
      setWalletValue(0);
      setValueError(null);
      setLoadingValue(false);
      setChartData([]);
      setChartError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadWalletData = async () => {
      // Load wallet value
      setLoadingValue(true);
      setValueError(null);

      // Load chart data
      setLoadingChart(true);
      setChartError(null);

      try {
        // Fetch wallet holdings for total value
        const [holdingsResponse, chartResponse] = await Promise.all([
          fetchFromEndpoints(
            HOLDINGS_API_ENDPOINTS,
            `wallets/${encodeURIComponent(
              address
            )}/portfolio/holdings?source=chain`,
            {
              cache: "no-store",
              signal: controller.signal,
              headers: { Accept: "application/json" },
            },
            "wallet holdings"
          ),
          fetchFromEndpoints(
            HOLDINGS_API_ENDPOINTS,
            `wallets/${encodeURIComponent(
              address
            )}/portfolio/value-series?win=30d&tf=1h`,
            {
              cache: "no-store",
              signal: controller.signal,
              headers: { Accept: "application/json" },
            },
            "wallet value series"
          ) as Promise<WalletValueResponse>,
        ]);

        // Process wallet value
        if (active) {
          const items = Array.isArray(holdingsResponse?.items)
            ? holdingsResponse.items
            : [];
          const total = items.reduce((sum: number, item: any) => {
            const valueUsd = safeNumber(item?.value_usd ?? item?.valueUsd);
            return sum + valueUsd;
          }, 0);
          setWalletValue(total);
        }

        // Process chart data
        if (active && chartResponse?.points?.length > 0) {
          const formattedData = chartResponse.points.map((point) => ({
            time: formatDate(point.t),
            value: point.value_usd,
          }));
          setChartData(formattedData);
        } else if (active) {
          setChartError("No chart data available");
        }
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load wallet data";
        setValueError(message);
        setChartError(message);
      } finally {
        if (active) {
          setLoadingValue(false);
          setLoadingChart(false);
        }
      }
    };

    loadWalletData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [address]);

  React.useEffect(() => {
    if (!address) {
      setClassCounts({});
      setLoadingWhaleCount(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadWhaleCount = async () => {
      setLoadingWhaleCount(true);
      try {
        const payload = await fetchFromEndpoints(
          HOLDINGS_API_ENDPOINTS,
          `trades/wallet/${encodeURIComponent(address)}`,
          {
            cache: "no-store",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
          "wallet trades"
        );
        const trades = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.items)
          ? payload.items
          : [];
        const counts = trades.reduce(
          (acc: Record<string, number>, trade: any) => {
            const rawClass =
              trade?.class ??
              trade?.Class ??
              trade?.category ??
              trade?.tag ??
              "";
            const key =
              typeof rawClass === "string" ? rawClass.toLowerCase().trim() : "";
            if (!key) return acc;
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          },
          {}
        );
        if (!active) return;
        setClassCounts(counts);
      } catch {
        if (!active) return;
        setClassCounts({});
      } finally {
        if (active) {
          setLoadingWhaleCount(false);
        }
      }
    };

    loadWhaleCount();

    return () => {
      active = false;
      controller.abort();
    };
  }, [address]);

  const walletValueDisplay = loadingValue
    ? "Loading..."
    : valueError
    ? "N/A"
    : formatCurrencyCompact(walletValue);
  const displayAddress = address?.trim() || "No wallet selected";

  return (
    <div className="w-full space-y-4">
      <h1 className=" text-3xl tracking-tight mb-10 mt-4">Wallet Analyzer</h1>
      <div className="relative overflow-hidden rounded-2xl">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-[#05010c]/90 via-[#030106]/80 to-[#010103]/95" />
          <div
            className="absolute -left-8 -top-12 h-28 w-52 rounded-full opacity-30 blur-[20px]"
            style={{ backgroundColor: "#4ADE80" }}
          />
          <div
            className="absolute -right-4 -top-12 h-28 w-52 rounded-full opacity-30 blur-[20px]"
            style={{ backgroundColor: "#662D91" }}
          />
          <div
            className="absolute -right-12 -bottom-12 h-32 w-48 rounded-full opacity-25 blur-[40px]"
            style={{ backgroundColor: "#F64F39" }}
          />
          <div
            className="absolute -left-12 -bottom-12 h-32 w-48 rounded-full opacity-25 blur-[40px]"
            style={{ backgroundColor: "#662D91" }}
          />
        </div>
        <div className="relative  z-10 px-6 py-6 text-white">
          <div className="relative mb-8 overflow-hidden  ">
            <div className="relative z-10 flex items-start gap-4  pb-4 border-b border-white/10">
              <div className="relative h-16 w-16 flex-shrink-0">
                {profile?.image_url ? (
                  <Image
                    src={
                      profile.image_url.startsWith("http")
                        ? profile.image_url
                        : `${process.env.NEXT_PUBLIC_API_BASE_URL}${profile.image_url}`
                    }
                    alt="Profile"
                    width={64}
                    height={64}
                    className="h-16 w-16  object-cover border border-white/10"
                    unoptimized={true}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = ProfileImg.src;
                    }}
                  />
                ) : (
                  <Image
                    src={ProfileImg}
                    alt="Profile"
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full object-cover border border-white/10"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white tracking-tight truncate">
                  {loadingProfile
                    ? "Loading..."
                    : profile?.display_name ||
                      profile?.handle ||
                      "Unnamed Profile"}
                </p>
                <p className="text-[11px] text-gray-300 truncate">
                  {formatWalletAddress(displayAddress)}
                </p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {!loadingProfile && (profile?.tags?.length ?? 0) > 0 && (
                    <span className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      {profile?.tags?.[0]}
                    </span>
                  )}
                  <span className="rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    <Star className="h-3.5 w-3.5 text-white inline-block align-middle" />
                  </span>
                </div>
              </div>
              {/* <div className="flex flex-col gap-2">
                <button className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-[#00ff9e]">
                  <Pencil className="h-3 w-3" />
                </button>
                <button className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:border-[#00ff9e]">
                  <ClipboardCopy className="h-3 w-3" />
                </button>
              </div> */}
            </div>

            {/* Wallet Value Section - Replica of Layout in image */}
            <div>
              <div className="flex mt-4 items-baseline justify-between">
                <span className="text-lg text-zinc-200">Wallet Value</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">
                    {walletValueDisplay}
                  </span>
                  {chartData.length > 1 && (
                    <span
                      className={`text-[11px] font-semibold ${
                        chartData[chartData.length - 1].value >=
                        chartData[0].value
                          ? "text-[#00ff9e]"
                          : "text-[#ff4d4d]"
                      }`}
                    >
                      {chartData.length > 1
                        ? `${(
                            ((chartData[chartData.length - 1].value -
                              chartData[0].value) /
                              chartData[0].value) *
                            100
                          ).toFixed(2)}%`
                        : "N/A"}
                    </span>
                  )}
                </div>
              </div>

              {/* Wallet value chart */}
              <div className="w-full h-24 mb-2">
                {loadingChart ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-pulse text-sm text-gray-400">
                      Loading chart...
                    </div>
                  </div>
                ) : chartError ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-sm text-red-400">
                      Chart unavailable
                    </div>
                  </div>
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="time"
                        hide
                        tickFormatter={(value) => value}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis
                        domain={["dataMin - (dataMin * 0.1)", "dataMax * 1.1"]}
                        hide
                      />
                      <defs>
                        <linearGradient
                          id="valueGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#F64F39"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="100%"
                            stopColor="#F64F39"
                            stopOpacity={0.1}
                          />
                        </linearGradient>
                      </defs>
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#F64F39"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                      <defs>
                        <linearGradient
                          id="areaGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#F64F39"
                            stopOpacity={0.2}
                          />
                          <stop
                            offset="100%"
                            stopColor="#F64F39"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <defs>
                        <linearGradient
                          id="areaGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#F64F39"
                            stopOpacity={0.2}
                          />
                          <stop
                            offset="100%"
                            stopColor="#F64F39"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <defs>
                        <filter
                          id="glow"
                          x="-50%"
                          y="-50%"
                          width="200%"
                          height="200%"
                        >
                          <feGaussianBlur stdDeviation="2" result="blur" />
                          <feComposite
                            in="SourceGraphic"
                            in2="blur"
                            operator="over"
                          />
                        </filter>
                      </defs>
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-sm text-gray-400">
                      No data available
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* <div>
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-gray-300">
                    <span>Social Tag</span>
                    <span>insights</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                    {socialTags.map(({ accent, icon: Icon, label }) => (
                    <div
                        key={label}
                        className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-gradient-to-br from-[#080b0f] to-[#040407] px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
                    >
                        <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">score</span>
                        <Icon className={`h-4 w-4 ${accent}`} />
                        </div>
                        <div>
                        <p className="text-[10px] uppercase tracking-widest text-gray-400">{label}</p>
                        <p className="text-2xl font-semibold text-white">0</p>
                        </div>
                    </div>
                    ))}
                </div>
                </div> */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-white mb-4">
              <span className="tracking-tight">Social Tag</span>
              <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-700 text-[10px] text-zinc-300">
                i
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(() => {
                const profileTags = profile?.tags || [];
                const socialTags = getSocialTagsFromProfile(profile);
                const tagsToShow =
                  socialTags.length > 0
                    ? socialTags
                    : Object.keys(socialTagImages);

                return tagsToShow.map((label) => {
                  const image = socialTagImages[label] || ProfileImg;
                  const labelKey = label.toLowerCase().trim();
                  const classKey = labelKey === "whale" ? "whale" : labelKey;
                  const tagValue =
                    classKey in classCounts
                      ? loadingWhaleCount
                        ? "..."
                        : String(classCounts[classKey] ?? 0)
                      : "0";

                  return (
                    <div
                      key={label}
                      className="flex flex-col justify-between rounded-xl bg-[#111111] p-4 min-h-[110px] border border-transparent hover:border-white/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12px] leading-tight text-zinc-500">
                          {label}
                        </p>
                        <div className="flex-shrink-0">
                          <Image
                            src={image}
                            alt={`${label} icon`}
                            width={24}
                            height={24}
                            className="h-10 w-10"
                          />
                        </div>
                      </div>
                      <div className="mt-auto">
                        <p className="text-3xl font-bold text-white">
                          {tagValue}
                        </p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
