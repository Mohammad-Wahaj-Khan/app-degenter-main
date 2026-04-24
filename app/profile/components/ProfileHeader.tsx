"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Camera,
  BadgeCheck,
  Zap,
  Calendar,
  Plus,
  ShieldCheck,
  RefreshCcw,
  AlertCircle,
  ExternalLink,
  Clock,
} from "lucide-react";
import { formatDateTime, truncateMiddle } from "../lib/profile-format";
import type { Profile } from "../lib/profile-api";
import { uploadProfileImage } from "../lib/profile-api";
import dynamic from "next/dynamic";
import { UltimateButton } from "./ProfileWallets";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

const WalletValueChart = dynamic(() => import("./WalletValueChart"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-white/5 rounded-xl animate-pulse" />
  ),
});

type ProfileHeaderProps = {
  profile: Profile;
  onUpgrade: () => void;
  isSaving: boolean;
  onImageUpdate: (imageUrl: string) => void;
  apiKey: string;
};

export default function ProfileHeader({
  profile,
  onUpgrade,
  isSaving,
  onImageUpdate,
  apiKey,
}: ProfileHeaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageRetryAttempted, setImageRetryAttempted] = useState(false);
  const [imageSrc, setImageSrc] = useState(profile.image_url || "");
  const [failedWalletAvatars, setFailedWalletAvatars] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlError, setPnlError] = useState<string | null>(null);
  const pnlFetchInFlightRef = useRef(false);
  const [pnlStats, setPnlStats] = useState<{
    tradingVolume: number;
    txCount: number;
    txsBuy: number;
    txsSell: number;
    holdSeconds: number;
    bought: number;
    sold: number;
    totalPnl: number;
  } | null>(null);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setImageRetryAttempted(false);
    setImageSrc(profile.image_url || "");
  }, [profile.image_url]);

  const handleImageClick = () => fileInputRef.current?.click();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile.user_id) return;
    try {
      setIsUploading(true);
      setImageError(false);
      setImageLoaded(false);
      const result = await uploadProfileImage(profile.user_id, file, apiKey);
      setImageSrc(result.image_url);
      onImageUpdate(result.image_url);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const walletAddress = profile.wallets?.[0]?.address || "";
  const wallets = profile.wallets ?? [];
  const fallbackIdentity = useMemo(() => {
    const candidate = (profile.handle || walletAddress || "").trim();
    if (!candidate) return "Degen User";
    if (candidate.startsWith("guest-")) return "Degen User";
    return candidate.length > 24 ? truncateMiddle(candidate, 10, 6) : candidate;
  }, [profile.handle, walletAddress]);
  const displayName = (profile.display_name || "").trim() || fallbackIdentity;
  const creationDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : undefined;
  const tags = useMemo(
    () => (Array.isArray(profile.tags) ? profile.tags.filter(Boolean).slice(0, 6) : []),
    [profile.tags]
  );
  const avatarFallbackLabel = useMemo(() => {
    const source = displayName || profile.handle || "DU";
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase())
      .join("") || "DU";
  }, [displayName, profile.handle]);

  const normalizeWalletApiBase = (value?: string) => {
    const trimmed = (value ?? "").trim();
    if (!trimmed || /undefined|null/i.test(trimmed)) return API_BASE_URL;
    return trimmed.replace(/\/+$/, "");
  };

  const buildUrl = (base: string, path: string) => {
    const normalizedBase = base.replace(/\/+$/, "");
    const normalizedPath = path.replace(/^\/+/, "");
    return `${normalizedBase}/${normalizedPath}`;
  };

  const fetchFromEndpoints = async (
    endpoints: string[],
    path: string,
    init: RequestInit = {}
  ) => {
    let lastError: string | null = null;
    for (const endpoint of endpoints) {
      try {
        const url = buildUrl(endpoint, path);
        const headers = new Headers(init.headers || undefined);
        const apiHeaders = new Headers(API_HEADERS || undefined);
        apiHeaders.forEach((value, key) => headers.set(key, value));
        if (apiKey) headers.set("x-api-key", apiKey);
        const res = await fetch(url, { ...init, headers });
        if (res.ok) return res.json();
        lastError = `HTTP ${res.status}`;
      } catch (err) {
        lastError =
          err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : "request failed";
      }
    }
    throw new Error(lastError || "request failed");
  };

  const safeNumber = (value: unknown): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const formatCurrencyCompact = (value: number) => {
    if (!Number.isFinite(value)) return "N/A";
    const formatter = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
    return `$${formatter.format(value)}`;
  };

  const formatCurrencySmart = (value: number) => {
    if (!Number.isFinite(value)) return "N/A";
    if (Math.abs(value) >= 1000) return formatCurrencyCompact(value);
    return `$${value.toFixed(2)}`;
  };

  const formatNumberCompact = (value: number) => {
    if (!Number.isFinite(value)) return "N/A";
    const formatter = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
    return formatter.format(value);
  };

  const formatHoldMinutes = (seconds: number, totalCount: number) => {
    if (!Number.isFinite(seconds) || totalCount <= 0) return "0m";
    const minutes = Math.round(seconds / 60 / totalCount);
    return `${minutes}m`;
  };

  useEffect(() => {
    if (!walletAddress) {
      setPnlStats(null);
      setPnlError("Connect a wallet to load performance metrics");
      return;
    }
    if (pnlFetchInFlightRef.current) return;
    const controller = new AbortController();
    const endpoints = Array.from(
      new Set([normalizeWalletApiBase(process.env.NEXT_PUBLIC_WALLET_HOLDINGS_API)])
    );

    const loadStats = async () => {
      pnlFetchInFlightRef.current = true;
      setPnlLoading(true);
      setPnlError(null);
      try {
        const payload = await fetchFromEndpoints(
          endpoints,
          `wallets/${encodeURIComponent(
            walletAddress
          )}/portfolio/value-series?win=30d`,
          {
            signal: controller.signal,
            cache: "no-store",
            headers: { Accept: "application/json" },
          }
        );

        const kpis = payload?.kpis ?? payload?.data?.kpis ?? {};
        setPnlStats({
          tradingVolume: safeNumber(kpis.trading_volume_usd),
          txCount: safeNumber(kpis.tx_count),
          txsBuy: safeNumber(kpis.txs_buy),
          txsSell: safeNumber(kpis.txs_sell),
          holdSeconds: safeNumber(kpis.avg_hold_seconds),
          bought: safeNumber(kpis.bought_usd),
          sold: safeNumber(kpis.sold_usd),
          totalPnl: safeNumber(kpis.total_pnl_usd),
        });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setPnlError("Performance metrics are temporarily unavailable");
      } finally {
        setPnlLoading(false);
        pnlFetchInFlightRef.current = false;
      }
    };

    loadStats();
    return () => {
      controller.abort();
      pnlFetchInFlightRef.current = false;
    };
  }, [walletAddress, apiKey]);

  const handleAvatarError = () => {
    if (imageSrc && !imageRetryAttempted) {
      setImageRetryAttempted(true);
      setImageLoaded(false);
      setImageSrc(
        imageSrc.includes("?")
          ? `${imageSrc}&t=${Date.now()}`
          : `${imageSrc}?t=${Date.now()}`
      );
      return;
    }
    setImageError(true);
  };

  const statCards = [
    {
      label: "Trading Volume",
      value: pnlStats ? formatCurrencyCompact(pnlStats.tradingVolume) : "N/A",
      tone: "text-[#cffff0]",
    },
    {
      label: "Buys / Sells",
      value: pnlStats
        ? `${formatNumberCompact(pnlStats.txsBuy)} / ${formatNumberCompact(
            pnlStats.txsSell
          )}`
        : "N/A",
      tone: "text-emerald-200",
    },
    {
      label: "Avg Hold",
      value: pnlStats ? formatHoldMinutes(pnlStats.holdSeconds, 1) : "N/A",
      tone: "text-white",
    },
    {
      label: "Bought / Sold",
      value: pnlStats
        ? `${formatCurrencyCompact(pnlStats.bought)} / ${formatCurrencyCompact(
            pnlStats.sold
          )}`
        : "N/A",
      tone: "text-[#ffb4a7]",
    },
  ];

  return (
    // rounded-[34px] border border-[rgba(208,162,61,0.28)] bg-[rgba(10,10,10,0.72)] p-[1px] shadow-[0_28px_90px_rgba(0,0,0,0.55)] backdrop-blur-[28px]
    <section className="relative overflow-hidden ">
      {/* <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(208,162,61,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))]" />
      <div className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-emerald-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-amber-500/10 blur-[140px]" /> */}
{/* rounded-[33px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] px-5 py-6 backdrop-blur-[30px] md:px-8 md:py-8 */}
      <div className="relative ">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex h-full flex-col rounded-[30px] border border-[rgba(57,200,166,0.12)] bg-[rgba(14,14,14,0.62)] p-5 shadow-[inset_0_1px_0_rgba(190,255,242,0.03),0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-[38px]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="flex justify-center self-start pt-2 mt-8 lg:justify-start lg:pt-0">
                <div className="relative">
                  <div className="absolute inset-[-14px] rounded-full bg-[conic-gradient(from_0deg,rgba(20,98,79,0.18),rgba(57,200,166,0.7),rgba(250,78,48,0.28),rgba(20,98,79,0.18))] blur-[10px] opacity-90 animate-[spin_8s_linear_infinite]" />
                  <div className="absolute inset-[-4px] rounded-full border border-[rgba(57,200,166,0.32)] shadow-[0_0_32px_rgba(57,200,166,0.28)]" />
                  <div
                    className={`relative h-32 w-32 cursor-pointer overflow-hidden rounded-full border border-[rgba(57,200,166,0.22)] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),rgba(16,16,16,0.96))] p-[3px] transition-transform duration-300 ${
                      isUploading ? "animate-pulse" : "hover:-translate-y-1"
                    }`}
                    onClick={handleImageClick}
                  >
                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#111111]">
                      {imageSrc && !imageError ? (
                        <>
                          <div
                            className={`absolute inset-0 bg-white/5 transition-opacity duration-500 ${
                              imageLoaded ? "opacity-0" : "opacity-100"
                            }`}
                          />
                          <img
                            src={imageSrc}
                            alt={displayName}
                            className={`h-full w-full object-cover transition-opacity duration-500 ${
                              imageLoaded ? "opacity-100" : "opacity-0"
                            }`}
                            onLoad={() => setImageLoaded(true)}
                            onError={handleAvatarError}
                          />
                        </>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(57,200,166,0.18),rgba(17,17,17,1))] text-[#d6fff3]">
                          <span className="text-3xl font-black tracking-[0.12em]">
                            {avatarFallbackLabel}
                          </span>
                          <Camera className="mt-2 text-[#64e3bf]/70" size={18} />
                        </div>
                      )}
                      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,transparent_48%,rgba(0,0,0,0.18)_100%)]" />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity duration-300 hover:opacity-100">
                      <Zap className="text-[#7aeed0]" size={24} />
                    </div>
                  </div>
                  <div className="absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(57,200,166,0.28)] bg-[linear-gradient(180deg,#86f4d7_0%,#39c8a6_60%,#14624f_100%)] text-[#031a15] shadow-[0_0_25px_rgba(57,200,166,0.26)]">
                    <BadgeCheck size={18} strokeWidth={2.8} />
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  {/* <div className="rounded-full border border-[rgba(57,200,166,0.18)] bg-[rgba(57,200,166,0.08)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.34em] text-[#97f1d8]">
                    Crystalline Identity
                  </div> */}
                  {/* <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                    Live Terminal
                  </div> */}
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h1 className="max-w-full break-words text-3xl font-black leading-[0.95] tracking-[0.04em] text-[#f7f4eb] md:text-4xl">
                      {displayName}
                    </h1>
                    {isSaving && (
                      <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-200">
                        <RefreshCcw size={12} className="animate-spin" />
                        Syncing
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="max-w-full break-all rounded-full border border-emerald-400/18 bg-emerald-400/8 px-3 py-1 font-mono text-[12px] text-emerald-200">
                      @{profile.handle || truncateMiddle(walletAddress, 6, 4)}
                    </span>
                    {creationDate && (
                      <span className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.16em] text-zinc-500">
                        <Calendar size={14} className="text-[#5fe0bc]" />
                        Joined {creationDate}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-4">
                    <p className="max-w-2xl text-sm leading-7 text-zinc-300 md:text-base">
                      {profile.bio?.trim()
                        ? profile.bio
                        : "On-chain identity calibrated for execution, attribution, and high-signal wallet intelligence."}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {tags.length ? (
                        tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/5 bg-white/[0.02] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-300 transition-colors hover:border-[rgba(57,200,166,0.18)] hover:text-[#96f0d6]"
                          >
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          No profile tags configured
                        </span>
                      )}
                    </div>
                  </div>

                  <UltimateButton onClick={onUpgrade} disabled={isSaving}>
                    <Plus size={18} className="transition-transform group-hover:rotate-90" />
                    Update Profile
                  </UltimateButton>
                </div>


              </div>
            </div>
                {wallets.length > 0 ? (
                  <div className="mt-auto grid gap-3 pt-2">
                    {wallets.map((wallet, index) => (
                      <div
                        key={wallet.address}
                        className="group relative flex w-full flex-col gap-4 rounded-[28px] border border-[rgba(57,200,166,0.10)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-4 shadow-[inset_0_1px_0_rgba(190,255,242,0.03),inset_0_-18px_30px_rgba(0,0,0,0.18),0_18px_42px_rgba(0,0,0,0.22)] backdrop-blur-[28px] transition-all duration-300 hover:border-[rgba(57,200,166,0.22)] hover:-translate-y-0.5 md:flex-row md:items-center"
                      >
                        <div className="relative h-14 w-14 shrink-0">
                          <a
                            href={`/portfolio?address=${wallet.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(57,200,166,0.22)] bg-[linear-gradient(180deg,rgba(57,200,166,0.24),rgba(250,78,48,0.16))] text-[#9bf4d7] opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label="View portfolio"
                            title="View Portfolio"
                          >
                            <ExternalLink size={12} />
                          </a>
                          {failedWalletAvatars[wallet.address] ? (
                            <div className="flex h-full w-full items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[radial-gradient(circle_at_top,rgba(57,200,166,0.18),rgba(17,17,17,1))] font-mono text-sm text-[#aaf5dc]">
                              {truncateMiddle(wallet.address, 2, 2)}
                            </div>
                          ) : (
                            <img
                              src={`https://avatar.vercel.sh/${wallet.address}.svg`}
                              alt="Wallet Avatar"
                              className="h-full w-full rounded-2xl border border-[rgba(255,255,255,0.08)] bg-neutral-800 object-cover"
                              onError={() =>
                                setFailedWalletAvatars((prev) => ({
                                  ...prev,
                                  [wallet.address]: true,
                                }))
                              }
                            />
                          )}
                        </div>

                        <div className="flex-1 space-y-1">
                          <div className="flex w-full items-start gap-2">
                            <div className="min-w-0">
                              <div className="break-all font-mono text-sm font-medium text-[#d8fff4]">
                                {wallet.address}
                              </div>
                            </div>
                            {/* <span className="flex-shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                              {wallet.network || "Zigchain"}
                            </span> */}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                            <span className="flex items-center gap-2 rounded-full border border-emerald-400/16 bg-emerald-500/8 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]" />
                              {index === 0 ? "Primary" : "Active"}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              Updated {formatDateTime(wallet.updated_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 border-t border-white/[0.05] pt-3 md:border-none md:pt-0">
                          <a
                            href={`/portfolio?address=${wallet.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group relative flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(57,200,166,0.12)] bg-[linear-gradient(180deg,rgba(57,200,166,0.10),rgba(250,78,48,0.04))] text-[#76eccb] shadow-[inset_0_1px_0_rgba(190,255,242,0.04)] hover:shadow-[0_0_24px_rgba(57,200,166,0.14)]"
                            aria-label="Open wallet portfolio"
                            title="Open wallet portfolio"
                          >
                            <ExternalLink size={16} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
          </div>

          <div className="grid gap-5">
            <div className="rounded-[30px] border border-[rgba(57,200,166,0.12)] bg-[rgba(10,10,10,0.58)] p-3 shadow-[inset_0_1px_0_rgba(190,255,242,0.03),0_18px_36px_rgba(0,0,0,0.24)] backdrop-blur-[34px]">
              <div className="h-[250px] overflow-hidden rounded-[26px] border border-white/[0.03] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] p-2">
                {walletAddress ? (
                  <WalletValueChart walletAddress={walletAddress} apiKey={apiKey} />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-[22px] border border-dashed border-white/5 bg-black/20 font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Analytics Unavailable
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[30px] border border-[rgba(57,200,166,0.12)] bg-[rgba(13,13,13,0.62)] p-5 shadow-[inset_0_1px_0_rgba(190,255,242,0.03),inset_0_-14px_28px_rgba(0,0,0,0.18)] backdrop-blur-[32px]">
              {/* <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                    Performance Intelligence
                  </p>
                  <h2 className="mt-1 text-lg font-bold tracking-[-0.02em] text-[#f6f1e6]">
                    Deep Stats Snapshot
                  </h2>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(57,200,166,0.22)] bg-[linear-gradient(180deg,rgba(57,200,166,0.16),rgba(20,98,79,0.08))] text-[#76e9c9] shadow-[0_0_24px_rgba(57,200,166,0.12)]">
                  <ShieldCheck size={18} />
                </div>
              </div> */}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {statCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-[22px] border border-white/[0.03] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] px-4 py-3 shadow-[inset_0_1px_0_rgba(190,255,242,0.03)]"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      {card.label}
                    </p>
                    <p className={`mt-2 text-sm font-semibold ${card.tone}`}>
                      {pnlLoading && !pnlStats ? "Loading..." : card.value}
                    </p>
                  </div>
                ))}
                <div className="sm:col-span-2 rounded-[24px] border border-[rgba(57,200,166,0.12)] bg-[linear-gradient(135deg,rgba(255,255,255,0.03),rgba(57,200,166,0.06))] px-4 py-4 shadow-[inset_0_1px_0_rgba(190,255,242,0.03)]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        Total PNL
                      </p>
                      <p
                        className={`mt-2 text-xl font-bold ${
                          pnlStats && pnlStats.totalPnl < 0
                            ? "text-rose-300"
                            : "text-[#cafff0]"
                        }`}
                      >
                        {pnlStats
                          ? `${pnlStats.totalPnl >= 0 ? "+" : ""}${formatCurrencySmart(
                              pnlStats.totalPnl
                            )}`
                          : "N/A"}
                      </p>
                    </div>
                    {pnlError ? (
                      <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/8 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-100/80">
                        <AlertCircle size={12} />
                        {pnlError}
                      </div>
                    ) : (
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-500/8 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200">
                        {walletAddress ? "Wallet Synced" : "Awaiting Wallet"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
