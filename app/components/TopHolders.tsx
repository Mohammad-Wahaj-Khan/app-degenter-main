"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import RecentTrades from "./RecentTrades";
import AuditPanel from "./audit-panel";
import { FileCode, Wallet } from "lucide-react";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

const API_BASE = API_BASE_URL;

const MAX_HOLDERS = 200;
const PAIR_CONTRACT_POOL_IDS: Record<string, string> = {
  zig1h72z8ptvcdqvuvy2lqanupwtextjmjmktj2ejgne2padxk0z8zds48shzq: "5",
  zig1jv7v8an78vwyfx409nvrguktz8dl97hg7v0qs59pnc9krlf4en8szqsq8h: "10",
};

interface Holder {
  address: string;
  balance: number;
  pctOfMax: number;
  pctOfTotal: number;
  label?: string;
}

interface TokenDetails {
  exponent: number;
  // Add other token details properties as needed
}

interface TopHoldersProps {
  tokenId?: string;
  exponent?: number;
  selectedPair?: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    pairContract?: string | null;
    poolId?: string | null;
  } | null;
}

type TabType =
  | "Trade History"
  | "Top Holders"
  | "Top Traders"
  | "Security"
  | "My Swaps";

const normalizeTokenRef = (value?: string | null) =>
  (value ?? "").replace(/^ibc\/\w+\//, "").trim().toLowerCase();

const isLikelyPairContract = (value?: string | null) =>
  normalizeTokenRef(value).startsWith("zig1");

const isZigAsset = (value?: string | null) => {
  const normalized = normalizeTokenRef(value);
  return normalized === "zig" || normalized === "uzig";
};

const extractTokenRef = (value?: string | null) => {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  return normalized.split(".").pop() || normalized;
};

const getKnownPoolIdForPairContract = (pairContract?: string | null) => {
  const normalized = normalizeTokenRef(pairContract);
  return normalized ? PAIR_CONTRACT_POOL_IDS[normalized] ?? null : null;
};

const getPoolIdFromPool = (pool: any): string | null => {
  const candidates = [
    pool?.poolId,
    pool?.pool_id,
    pool?.poolIdNumber,
    pool?.id,
  ];
  const value = candidates.find((candidate) => candidate != null && candidate !== "");
  return value == null ? null : String(value);
};

const getPairContractFromPool = (pool: any): string | null =>
  pool?.pairContract ?? pool?.pair_contract ?? null;

const TopHolders: React.FC<TopHoldersProps> = ({ tokenId, selectedPair }) => {
  // console.log('[TopHolders] tokenId:', tokenId);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("Top Holders");
  const [currentPage, setCurrentPage] = useState(1);
  const holdersPerPage = 20;
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null);
  const selectedPairContract =
    selectedPair?.pairContract ||
    (isLikelyPairContract(selectedPair?.quoteDenom)
      ? selectedPair?.quoteDenom
      : null) ||
    (isLikelyPairContract(selectedPair?.baseDenom)
      ? selectedPair?.baseDenom
      : null);
  const selectedBaseDenom = isLikelyPairContract(selectedPair?.baseDenom)
    ? null
    : selectedPair?.baseDenom;
  const selectedQuoteDenom = isLikelyPairContract(selectedPair?.quoteDenom)
    ? null
    : selectedPair?.quoteDenom;
  const selectedPairWithZig =
    isZigAsset(selectedPair?.baseSymbol) ||
    isZigAsset(selectedPair?.quoteSymbol) ||
    isZigAsset(selectedBaseDenom) ||
    isZigAsset(selectedQuoteDenom);
  const shouldUsePoolPricing =
    !selectedPairWithZig &&
    Boolean(
      selectedPair?.poolId ||
        getKnownPoolIdForPairContract(selectedPairContract) ||
        (selectedBaseDenom && selectedQuoteDenom) ||
        selectedPairContract
    );

  const resolveTokenRef = () =>
    extractTokenRef(selectedBaseDenom) ||
    extractTokenRef(tokenId) ||
    extractTokenRef(selectedPair?.baseSymbol) ||
    "";

  const resolveSelectedPairPoolId = async (
    tokenRef: string
  ): Promise<string | null> => {
    if (!shouldUsePoolPricing) return null;
    if (selectedPair?.poolId) return selectedPair.poolId;
    const knownPoolId = getKnownPoolIdForPairContract(selectedPairContract);
    if (knownPoolId) return knownPoolId;

    const poolSources = [
      selectedBaseDenom,
      selectedQuoteDenom,
      selectedPairContract,
      tokenRef,
    ].filter((value): value is string => Boolean(value));

    for (const source of poolSources) {
      try {
        const response = await fetch(
          `${API_BASE}/tokens/${encodeURIComponent(
            source
          )}/pools?dominant=base&bucket=24h&limit=100`,
          { headers: API_HEADERS }
        );
        if (!response.ok) continue;
        const json = await response.json();
        const pools = Array.isArray(json?.data) ? json.data : [];
        const matchedPool = pools.find((pool: any) => {
          const pairContract = normalizeTokenRef(getPairContractFromPool(pool));
          if (
            selectedPairContract &&
            pairContract === normalizeTokenRef(selectedPairContract)
          ) {
            return true;
          }

          const poolBase = normalizeTokenRef(pool?.base?.denom);
          const poolQuote = normalizeTokenRef(pool?.quote?.denom);
          const selectedBase = normalizeTokenRef(selectedBaseDenom);
          const selectedQuote = normalizeTokenRef(selectedQuoteDenom);
          return (
            poolBase === selectedBase &&
            poolQuote === selectedQuote
          );
        });
        const poolId = getPoolIdFromPool(matchedPool);
        if (poolId) return poolId;
      } catch (error) {
        console.error("Error resolving holders pool id:", error);
      }
    }

    return null;
  };

  const buildTokenUrl = (tokenRef: string, poolId: string | null) => {
    if (shouldUsePoolPricing && poolId) {
      return `${API_BASE}/tokens/${encodeURIComponent(
        tokenRef
      )}?priceSource=pool&poolId=${encodeURIComponent(
        poolId
      )}&dominant=quote&view=auto`;
    }
    return `${API_BASE}/tokens/${encodeURIComponent(tokenRef)}`;
  };

  const buildHoldersUrl = (tokenRef: string, poolId: string | null) => {
    if (shouldUsePoolPricing && poolId) {
      return `${API_BASE}/tokens/${encodeURIComponent(
        tokenRef
      )}/holders?priceSource=pool&poolId=${encodeURIComponent(
        poolId
      )}&dominant=quote&view=auto`;
    }
    return `${API_BASE}/tokens/${encodeURIComponent(tokenRef)}/holders`;
  };

  // Fetch token details including exponent
  useEffect(() => {
    const fetchTokenDetails = async () => {
      const tokenRef = resolveTokenRef();
      if (!tokenRef) return;
      try {
        const poolId = await resolveSelectedPairPoolId(tokenRef);
        const response = await fetch(
          buildTokenUrl(tokenRef, poolId),
          { headers: API_HEADERS }
        );
        if (!response.ok) throw new Error("Failed to fetch token details");
        const data = await response.json();
        setTokenDetails(data?.data || null);
      } catch (error) {
        console.error("Error fetching token details:", error);
        setTokenDetails(null);
      }
    };

    fetchTokenDetails();
  }, [tokenId, selectedPair]);

  const fetchContractLabel = async (contractAddress: string) => {
    try {
      const response = await fetch(
        `https://zigchain-lcd.degenter.io/cosmwasm/wasm/v1/contract/${contractAddress}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data?.contract_info?.label || null;
    } catch (error) {
      console.error("Error fetching contract label:", error);
      return null;
    }
  };

  const fetchTopHolders = async () => {
    const tokenRef = resolveTokenRef();
    if (!tokenRef) return;
    try {
      setLoading(true);
      const poolId = await resolveSelectedPairPoolId(tokenRef);
      const res = await fetch(
        buildHoldersUrl(tokenRef, poolId),
        {
          cache: "no-store",
          headers: API_HEADERS,
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        // Fetch labels for contract addresses
        const holdersWithLabels = await Promise.all(
          json.data.map(async (holder: Holder) => {
            if (holder.address.length > 60) {
              const label = await fetchContractLabel(holder.address);
              return { ...holder, label };
            }
            return holder;
          })
        );
        setHolders(holdersWithLabels);
      } else {
        setHolders([]);
      }
    } catch (err) {
      console.error("Failed to fetch top holders:", err);
      setHolders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopHolders();
  }, [tokenId, selectedPair]);

  // Pagination logic
  const indexOfLastHolder = currentPage * holdersPerPage;
  const indexOfFirstHolder = indexOfLastHolder - holdersPerPage;
  const currentHolders = holders.slice(indexOfFirstHolder, indexOfLastHolder);
  const totalPages = Math.ceil(holders.length / holdersPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const tabs: TabType[] = [
    "Trade History",
    "Top Holders",
    "Top Traders",
    "Security",
    "My Swaps",
  ];

  return (
    <div
      className="border-b border-x border-[#808080]/20 rounded-b-md overflow-hidden shadow-md w-full"
      style={{
        backgroundImage: `linear-gradient(120deg,#000000 65%,#14624F 100%)`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Tabs Header */}
      {/* <div className="relative flex items-center justify-between px-4 py-3 bg-black/40">
        <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-gradient-to-r from-[#39C8A6] from-37% to-[#FA4E30] to-67%"></div>
        <div className="flex items-center gap-4 text-sm sm:text-base overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`${
                tab === activeTab
                  ? "flex items-center justify-center text-white bg-[#1C1C1C] p-2 rounded"
                  : "text-gray-400 hover:text-white"
              } font-medium transition-all whitespace-nowrap flex items-center justify-center h-full`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div> */}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm sm:text-[0.95rem] text-white">
          <thead className="bg-black/60 text-white uppercase text-xs tracking-wider">
            <tr>
              <td className="px-4 py-2 text-left text-gray-400">Rank</td>
              <td className="px-4 py-2 text-left text-gray-400">Address</td>
              <td className="px-4 py-2 text-left text-gray-400">Balance</td>
              <td className="px-4 py-2 text-left text-gray-400">% of Max</td>
              <td className="px-4 py-2 text-left text-gray-400">% of Total</td>
            </tr>
          </thead>

          <tbody className="bg-black/30">
            {loading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i} className="border-b border-gray-800 animate-pulse">
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-3 sm:px-4 py-3">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                </tr>
              ))
            ) : activeTab === "Top Holders" && currentHolders.length > 0 ? (
              currentHolders.map((h, i) => (
                <tr
                  key={i}
                  className="hover:bg-white/5 transition border-b border-white/15"
                >
                  <td className="px-4 py-2">{indexOfFirstHolder + i + 1}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <Link
                          href={
                            h.address.length > 60
                              ? `https://zigscan.org/smart-contracts/contract/${h.address}`
                              : `https://zigscan.org/address/${h.address}`
                          }
                          target="_blank"
                          className="text-[#00FFA0] hover:underline flex items-center gap-1"
                        >
                          {/* {h.address.length > 60 ? (
                            <FileCode className="w-4 h-4" />
                          ) : (
                            <Wallet className="w-4 h-4" />
                          )} */}
                          {h.address.slice(0, 8)}...{h.address.slice(-6)}
                        </Link>
                      </div>
                      {h.label && (
                        <span className="text-xs text-gray-400">
                          {h.label} • {h.pctOfMax.toFixed(3)}% of Max
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-green-400">
                    {(tokenDetails?.exponent === 0
                      ? h.balance * 1000000
                      : h.balance
                    ).toLocaleString(undefined, {
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
      </div>

    </div>
  );
};

export default TopHolders;
