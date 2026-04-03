/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTokenSummary } from "@/app/hooks/useTokenSummary";
import {
  tokenAPI,
  type TokenDetailResponse,
  API_BASE_URL,
  API_HEADERS,
} from "@/lib/api";

const API_BASE = API_BASE_URL;

type TabType = "Security" | "Top Holders" | "Recent Trades";

interface Holder {
  address: string;
  balance: number;
  pctOfMax: number;
  pctOfTotal: number;
}

interface Trade {
  txHash: string;
  trader: string;
  side: string;
  amount: number;
  priceUsd: number;
  time: string;
}

interface SecurityAPIResponse {
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
    checks?: Record<string, any>;
    dev?: Record<string, any>;
    lastUpdated?: string;
    source?: string;
  };
}

const Security: React.FC<{ tokenId?: string | number; tokenKey?: string }> = ({
  tokenId,
  tokenKey,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("Security");
  const [securityData, setSecurityData] = useState<
    SecurityAPIResponse["data"] | null
  >(null);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryFallback, setSummaryFallback] =
    useState<TokenDetailResponse["data"] | null>(null);
  const fetchKey = tokenKey || (tokenId != null ? String(tokenId) : "");
  const { data: summaryData } = useTokenSummary({
    tokenId,
    tokenKey: fetchKey,
  });
  const summary = summaryData ?? summaryFallback;

  const [currentPage, setCurrentPage] = useState(1);
  const holdersPerPage = 10;

  // Handle stzig token case
  if (
    fetchKey?.toLowerCase() === "stzig" ||
    fetchKey ===
      "coin.zig109f7g2rzl2aqee7z6gffn8kfe9cpqx0mjkk7ethmx8m2hq4xpe9snmaam2.stzig"
  ) {
    return (
      <div
        className="border-b border-x border-[#808080]/20 rounded-b-md overflow-hidden shadow-md w-full text-white backdrop-blur-md"
        style={{
          backgroundImage: `linear-gradient(120deg,#000000 65%,#14624F 100%)`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead className="bg-black/60 text-xs uppercase">
              <tr>
                <td className="px-4 py-2 text-left text-gray-400">Parameter</td>
                <td className="px-4 py-2 text-left text-gray-400">Value</td>
              </tr>
            </thead>
            <tbody className="bg-black/30">
              {[
                "Security Score",
                "Mintable",
                "Can Change Mint Cap",
                "Total Supply",
                "Max Supply",
                "Top 10 Holders %",
                "Holders",
              ].map((param) => (
                <tr key={param} className="border-b border-white/10">
                  <td className="px-4 py-2 font-medium">{param}</td>
                  <td className="px-4 py-2 text-gray-400">--</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ---------------- Fetchers ---------------- */
  const fetchSecurity = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/tokens/${fetchKey}/security`, {
        headers: API_HEADERS,
      });
      const json: SecurityAPIResponse = await res.json();
      if (json.success) setSecurityData(json.data);
    } catch (err) {
      console.error("Failed to fetch security data", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHolders = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/tokens/${fetchKey}/holders`, {
        headers: API_HEADERS,
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setHolders(json.data);
    } catch (err) {
      console.error("Failed to fetch holders", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrades = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/tokens/${fetchKey}/trades?limit=20`,
        { headers: API_HEADERS }
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setTrades(json.data);
    } catch (err) {
      console.error("Failed to fetch trades", err);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- Load on Tab Change ---------------- */
  useEffect(() => {
    if (fetchKey) {
      if (activeTab === "Security") fetchSecurity();
      if (activeTab === "Top Holders") fetchHolders();
      if (activeTab === "Recent Trades") fetchTrades();
    }
  }, [activeTab, fetchKey]);

  useEffect(() => {
    if (!fetchKey || summaryData) return;
    setSummaryFallback(null);
    let active = true;
    tokenAPI
      .getTokenDetailsBySymbol(fetchKey, "best", true)
      .then((res) => {
        if (!active) return;
        if (res?.data) setSummaryFallback(res.data);
      })
      .catch((err) => {
        console.error("Failed to load security summary fallback:", err);
      });
    return () => {
      active = false;
    };
  }, [fetchKey, summaryData]);

  const formatCompact = (value?: number, prefix = "") => {
    if (value == null || !Number.isFinite(value)) return "—";
    return `${prefix}${Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value)}`;
  };

  // Then place your conditional logic and other code below
  const indexOfLastHolder = currentPage * holdersPerPage;

  /* ---------------- Pagination ---------------- */
  const indexOfFirstHolder = indexOfLastHolder - holdersPerPage;
  const currentHolders = holders.slice(indexOfFirstHolder, indexOfLastHolder);
  const totalPages = Math.ceil(holders.length / holdersPerPage);
  const handlePageChange = (page: number) =>
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));

  const tabs: TabType[] = ["Security", "Top Holders", "Recent Trades"];
  // console.log(securityData, "security data");
  const liveMarketCap = formatCompact(
    summary?.mcapDetail?.usd ?? summary?.mc,
    "$"
  );
  const liveLiquidity = formatCompact(summary?.liquidity, "$");
  const liveHolders = formatCompact(
    typeof summary?.holder === "number"
      ? summary?.holder
      : Number(summary?.holder),
    ""
  );
  const liveSupplyMax = formatCompact(
    typeof summary?.supply === "number"
      ? summary?.supply
      : summary?.supply?.max
  );
  const liveSupplyCirc = formatCompact(
    summary?.supply?.circulating ?? summary?.circulatingSupply
  );
  /* ---------------- Render ---------------- */
  return (
    <div
      className="border-b border-x border-[#808080]/20 rounded-b-md overflow-hidden shadow-md w-full text-white backdrop-blur-md"
      style={{
        backgroundImage: `linear-gradient(120deg,#000000 65%,#14624F 100%)`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="overflow-x-auto w-full">
        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : activeTab === "Security" ? (
          securityData || summary ? (
            <table className="w-full text-sm">
            <thead className="bg-black/60 text-xs uppercase">
              <tr>
                <td className="px-4 py-2 text-left text-gray-400">Parameter</td>
                <td className="px-4 py-2 text-left text-gray-400">Value</td>
              </tr>
            </thead>
            <tbody className="bg-black/30">
              {summary && (
                <>
                  <tr className="border-b border-white/10">
                    <td className="px-4 py-2 font-medium">Market Cap</td>
                    <td className="px-4 py-2 text-white">{liveMarketCap}</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-4 py-2 font-medium">Liquidity</td>
                    <td className="px-4 py-2 text-white">{liveLiquidity}</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-4 py-2 font-medium">Circulating</td>
                    <td className="px-4 py-2 text-white">{liveSupplyCirc}</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-4 py-2 font-medium">Max Supply</td>
                    <td className="px-4 py-2 text-white">{liveSupplyMax}</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="px-4 py-2 font-medium">Holders</td>
                    <td className="px-4 py-2 text-white">{liveHolders}</td>
                  </tr>
                </>
              )}

              {/* Security Score */}
              {securityData && (
                <tr className="border-b border-white/10">
                  <td className="px-4 py-2 font-medium">Security Score</td>
                  <td className="px-4 py-2 text-[#39C8A6]">
                    {securityData.score}
                  </td>
                </tr>
              )}

              {/* Penalties */}
              {securityData?.penalties && securityData.penalties.length > 0 && (
                <tr className="border-b border-white/10">
                  <td className="px-4 py-2 font-medium">Penalties</td>
                  <td className="px-4 py-2 text-red-400">
                    {securityData.penalties
                      ?.map((p) => `${p.k} (${p.pts})`)
                      .join(", ")}
                  </td>
                </tr>
              )}

              {/* Bonuses */}
              {securityData?.bonuses && securityData.bonuses.length > 0 && (
                <tr className="border-b border-white/10">
                  <td className="px-4 py-2 font-medium">Bonuses</td>
                  <td className="px-4 py-2 text-green-400">
                    {securityData.bonuses
                      ?.map((b) => `${b.k} (+${b.pts})`)
                      .join(", ")}
                  </td>
                </tr>
              )}

              {/* Categories */}
              {securityData?.categories &&
                Object.entries(securityData.categories).map(
                  ([catKey, catVal]) => (
                    <tr key={catKey} className="border-b border-white/10">
                      <td className="px-4 py-2 font-medium capitalize">
                        {catKey}
                      </td>
                      <td className="px-4 py-2 text-blue-400">
                        {Object.entries(catVal)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" | ")}
                      </td>
                    </tr>
                  )
                )}

              {/* Checks */}
              {securityData?.checks &&
                Object.entries(securityData.checks).map(([key, value]) => (
                  <tr key={key} className="border-b border-white/10">
                    <td className="px-4 py-2 capitalize text-gray-300">
                      {key.replace(/([A-Z])/g, " $1")}
                    </td>
                    <td className="px-4 py-2">
                      {typeof value === "boolean" ? (
                        value ? (
                          <span className="text-red-400 font-medium">
                            ✅ True
                          </span>
                        ) : (
                          <span className="text-green-400 font-medium">
                            ❌ False
                          </span>
                        )
                      ) : (
                        <span className="text-blue-400">
                          {value?.toString()}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

              {/* Dev Info */}
              {securityData?.dev &&
                Object.entries(securityData.dev).map(([key, value]) => (
                  <tr key={key} className="border-b border-white/10">
                    <td className="px-4 py-2 capitalize text-gray-300">
                      {key.replace(/([A-Z])/g, " $1")}
                    </td>
                    <td className="px-4 py-2 text-blue-400">
                      {value?.toString()}
                    </td>
                  </tr>
                ))}

              {/* Last Updated */}
              {securityData?.lastUpdated && (
                <tr className="border-b border-white/10">
                  <td className="px-4 py-2 font-medium">Last Updated</td>
                  <td className="px-4 py-2 text-gray-400">
                    {new Date(securityData.lastUpdated).toLocaleString()}
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          ) : (
            <div className="p-6 text-center text-gray-400">
              No live security data available.
            </div>
          )
        ) : activeTab === "Top Holders" ? (
          <table className="w-full text-sm">
            <thead className="bg-black/60 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Rank</th>
                <th className="px-4 py-2 text-left">Address</th>
                <th className="px-4 py-2 text-left">Balance</th>
                <th className="px-4 py-2 text-left">% of Max</th>
                <th className="px-4 py-2 text-left">% of Total</th>
              </tr>
            </thead>
            <tbody className="bg-black/30">
              {currentHolders.length > 0 ? (
                currentHolders.map((h, i) => (
                  <tr
                    key={i}
                    className="border-b border-white/10 hover:bg-white/5"
                  >
                    <td className="px-4 py-2">{indexOfFirstHolder + i + 1}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`https://zigscan.org/address/${h.address}`}
                        target="_blank"
                        className="text-[#00FFA0] hover:underline"
                      >
                        {h.address.slice(0, 8)}...{h.address.slice(-6)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-green-400">
                      {h.balance.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-4 py-2 text-yellow-400">
                      {h.pctOfMax.toFixed(3)}%
                    </td>
                    <td className="px-4 py-2 text-blue-400">
                      {h.pctOfTotal.toFixed(3)}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center text-gray-500 py-6">
                    No holder data found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : activeTab === "Recent Trades" ? (
          <table className="w-full text-sm">
            <thead className="bg-black/60 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Trader</th>
                <th className="px-4 py-2 text-left">Side</th>
                <th className="px-4 py-2 text-left">Amount</th>
                <th className="px-4 py-2 text-left">Price (USD)</th>
                <th className="px-4 py-2 text-left">Time</th>
              </tr>
            </thead>
            <tbody className="bg-black/30">
              {trades.length > 0 ? (
                trades.map((t, i) => (
                  <tr
                    key={i}
                    className="border-b border-white/10 hover:bg-white/5"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`https://zigscan.org/address/${t.trader}`}
                        target="_blank"
                        className="text-[#00FFA0] hover:underline"
                      >
                        {t.trader.slice(0, 8)}...{t.trader.slice(-6)}
                      </Link>
                    </td>
                    <td
                      className={`px-4 py-2 font-medium ${
                        t.side.toLowerCase() === "buy"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {t.side}
                    </td>
                    <td className="px-4 py-2">{t.amount.toFixed(2)}</td>
                    <td className="px-4 py-2">${t.priceUsd.toFixed(4)}</td>
                    <td className="px-4 py-2 text-gray-400">{t.time}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center text-gray-500 py-6">
                    No recent trades found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
};

export default Security;
