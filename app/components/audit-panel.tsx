"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useTokenSummary } from "@/app/hooks/useTokenSummary";
import {
  tokenAPI,
  type TokenDetailResponse,
  API_BASE_URL,
  API_HEADERS,
} from "@/lib/api";

const API_BASE = API_BASE_URL;

interface SecurityResponse {
  success: boolean;
  data: {
    score: number;
    penalties?: { k: string; pts: number }[];
    bonuses?: { k: string; pts: number }[];
    categories?: {
      supply?: Record<string, any>;
      distribution?: Record<string, any>;
      adoption?: Record<string, any>;
    };
    checks?: {
      isMintable?: boolean;
      canChangeMintingCap?: boolean;
      maxSupply?: number;
      totalSupply?: number;
      top10PctOfMax?: number;
      creatorPctOfMax?: number;
      holdersCount?: number;
    };
    lastUpdated?: string;
    source?: string;
  };
}

export default function AuditPanel({ tokenKey }: { tokenKey?: string | null }) {
  const [securityData, setSecurityData] = useState<SecurityResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryFallback, setSummaryFallback] = useState<TokenDetailResponse["data"] | null>(null);
  
  // Real-time hook
  const { data: summaryData } = useTokenSummary({
    tokenKey: tokenKey ?? null,
  });

  // Use real-time data if available, otherwise fallback to initial fetch
  const summary = useMemo(() => summaryData ?? summaryFallback, [summaryData, summaryFallback]);

  useEffect(() => {
    const fetchSecurityData = async () => {
      if (!tokenKey) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE}/tokens/${encodeURIComponent(tokenKey)}/security`,
          { headers: API_HEADERS }
        );
        const data: SecurityResponse = await response.json();
        if (data?.success) setSecurityData(data.data);
      } catch (error) {
        // console.error("Error fetching security data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSecurityData();
  }, [tokenKey]);

  useEffect(() => {
    if (!tokenKey || summaryData) return;
    setSummaryFallback(null);
    let active = true;
    tokenAPI
      .getTokenDetailsBySymbol(tokenKey, "best", true)
      .then((res) => {
        if (!active) return;
        if (res?.data) setSummaryFallback(res.data);
      })
      .catch((error) => {
        console.error("Failed to load audit summary fallback:", error);
      });
    return () => {
      active = false;
    };
  }, [tokenKey, summaryData]);

  const getStatusColor = (condition: boolean) =>
    condition ? "bg-red-400" : "bg-emerald-400";

  // Formatter helpers
  const formatNumber = (value?: number | null, fallback = "—") =>
    value == null ? fallback : Math.floor(value).toLocaleString();

  // REAL-TIME DERIVED VALUES
  // We prioritize WebSocket (summary) fields for live updates
  const liveTotalSupply = summary?.supply?.circulating ?? summary?.circulatingSupply ?? securityData?.checks?.totalSupply;
  const liveMaxSupply = summary?.supply?.max ?? securityData?.checks?.maxSupply;
  const liveHolders = summary?.holder ?? (summary as any)?.holders ?? securityData?.checks?.holdersCount;

  if (loading) {
    return (
      <div className="w-full mx-auto">
        <div className="rounded-lg bg-cover bg-center h-36 w-full" style={{ backgroundImage: "url('/degenter.png')" }} />
        <div className="bg-[#050505] rounded-2xl p-6 border border-[#808080]/20 text-white text-sm flex justify-center">
          Loading security data...
        </div>
      </div>
    );
  }

  if (!tokenKey) {
    return (
      <div className="w-full mx-auto">
        <div className="rounded-lg bg-cover bg-center h-36 w-full" style={{ backgroundImage: "url('/degenter.png')" }} />
        <div className="bg-[#050505] rounded-2xl p-6 border border-[#808080]/20 text-white text-sm flex justify-center">
          Unable to resolve token identifier for security data
        </div>
      </div>
    );
  }

  if (!securityData) {
    return (
      <div className="w-full mx-auto">
        <div className="rounded-lg bg-cover bg-center h-36 w-full" style={{ backgroundImage: "url('/degenter.png')" }} />
        <div className="bg-[#050505] rounded-2xl p-6 border border-[#808080]/20 text-white text-sm flex justify-center">
          Failed to load security data
        </div>
      </div>
    );
  }

  const checks = securityData.checks || {};
  const isStzigToken =
    tokenKey?.toLowerCase() === "stzig" ||
    tokenKey?.toLowerCase().includes(".stzig");
  const displayNumber = (value?: number | null) =>
    isStzigToken ? "--" : formatNumber(value);
  const statusLabel = isStzigToken
    ? "--"
    : checks.canChangeMintingCap
    ? "Yes"
    : "No";
  const statusColorClass = isStzigToken
    ? "bg-gray-500"
    : getStatusColor(!!checks.canChangeMintingCap);
  const top10PctLabel = isStzigToken
    ? "--"
    : checks.top10PctOfMax != null
    ? `${checks.top10PctOfMax.toFixed(2)}%`
    : "—";
  const displayScore = isStzigToken ? "--" : securityData.score ?? "--";
  const scoreValue = isStzigToken ? 0 : securityData.score ?? 0;
  const scoreDash = (Math.min(Math.max(scoreValue, 0), 100) / 100) * 283;

  return (
    <div className="w-full mx-auto">
      <Link href={`https://x.com/DegenTer_Bot`} target="_blank">
        <div className="rounded-lg h-48 w-full border border-[#808080]/20 bg-cover bg-center" style={{ backgroundImage: "url('/degenter.png')" }} />
      </Link>

      <div className="bg-[#050505] rounded-lg p-6 shadow-lg border border-[#808080]/20 text-white text-sm flex flex-col mt-2 items-center">
        {/* Animated Gauge */}
        <div className="relative flex justify-center items-center mb-3">
          <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FF6B00" />
                <stop offset="100%" stopColor="#00FFA3" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="45" stroke="#1E1E1E" strokeWidth="6" fill="transparent" />
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="url(#scoreGradient)"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={`${scoreDash} 283`}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute flex items-baseline justify-center">
            <span className="text-3xl font-medium text-white">{displayScore}</span>
            {displayScore !== "--" && (
              <span className="text-gray-400 text-xs -mb-1">/100</span>
            )}
          </div>
        </div>

        <h2 className="text-lg mb-4 text-center">DegenScore</h2>

        <div className="w-full space-y-3">
          {/* Real-time Status Check */}
          {"canChangeMintingCap" in checks && (
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Can Change Mint Cap</span>
              <div className="flex items-center gap-2">
                <span className="text-white/80 text-xs">{statusLabel}</span>
                <div className={`w-3 h-3 rounded-sm ${statusColorClass}`} />
              </div>
            </div>
          )}

          {/* Real-time Total Supply */}
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Total Supply</span>
            <span className="text-white/80 text-xs font-mono">
              {displayNumber(liveTotalSupply)}
            </span>
          </div>

          {/* Real-time Max Supply */}
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Max Supply</span>
            <span className="text-white/80 text-xs font-mono">
              {displayNumber(liveMaxSupply)}
            </span>
          </div>

          {/* Top 10 Holders (Static from Audit) */}
          {"top10PctOfMax" in checks && (
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Top 10 Holders %</span>
              <span className="text-white/80 text-xs">{top10PctLabel}</span>
            </div>
          )}

          {/* Real-time Holders Count */}
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Holders</span>
            <span className="text-white/80 text-xs font-mono">
              {displayNumber(liveHolders)}
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            const securityTabButton = document.querySelector('[data-tab="security"]') as HTMLElement;
            if (securityTabButton) {
              securityTabButton.click();
              setTimeout(() => {
                document.getElementById("security-tab")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 100);
            }
          }}
          className="w-full mt-6 py-2.5 bg-emerald-400 hover:bg-emerald-500 transition-colors rounded-lg text-black font-medium"
        >
          Check Audits
        </button>
      </div>
    </div>
  );
}
