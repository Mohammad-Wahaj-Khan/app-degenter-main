"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "../config/chain";
import { API_BASE_URL, API_HEADERS } from "@/lib/api";

/* ---------- CONFIG ---------- */
const API_BASE = API_BASE_URL;

/* ---------- TYPES ---------- */
interface Holder {
  address: string;
  balance: number;
  pctOfMax: number;
  pctOfTotal: number;
}

interface Swap {
  time: string;
  txHash: string;
  direction: string;
  offerDenom: string;
  offerAmount: number;
  askDenom: string;
  returnAmount: number;
  priceUsd: number;
  valueUsd: number;
}

type TabType = "My Swaps" | "Top Holders";

interface MySwapsProps {
  tokenId?: string;
}

/* ---------- COMPONENT ---------- */
const MySwaps: React.FC<MySwapsProps> = ({ tokenId }) => {
  // console.log('[MySwaps] Component rendering with tokenId:', tokenId);

  // State management
  const [holders, setHolders] = useState<Holder[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [symbolMap, setSymbolMap] = useState<Record<string, string>>({});
  const [tokenImageMap, setTokenImageMap] = useState<Record<string, string>>(
    {}
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabType>("My Swaps");
  const { address: walletAddr, connect } = useChain(CHAIN_NAME || "zigchain-1");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Constants
  const perPage = 15;

  // Memoized fetch function for swaps
  const fetchSwaps = useCallback(
    async (address: string) => {
      if (!address) return;

      // console.log('[fetchSwaps] Fetching swaps for address:', address, 'tokenId:', tokenId);
      setLoading(true);
      setError(null);

      try {
        // Build query parameters
        const params = new URLSearchParams();

        // Always add pagination
        params.append("page", currentPage.toString());
        params.append("limit", perPage.toString());

        // Add token filter if tokenId is provided
        if (tokenId) {
          // First try exact match (for denom)
          params.append("token", tokenId);
          // Then add additional search parameters for symbol/name matching
          params.append("search", tokenId);
        }

        const url = `${API_BASE}/trades/wallet/${address}?tf=60d&${params.toString()}`;
        // console.log('[fetchSwaps] Fetching from URL:', url);

        const response = await fetch(url, {
          headers: { Accept: "application/json", ...API_HEADERS },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch swaps: ${response.statusText}`);
        }

        const result = await response.json();
        // console.log('[fetchSwaps] Received swaps data:', result);

        if (Array.isArray(result?.data)) {
          // Filter swaps to include those matching the token by denom, symbol, or name
          const filteredSwaps = tokenId
            ? result.data.filter((swap: Swap) => {
                const searchTerm = tokenId.toLowerCase();
                const offerLower = swap.offerDenom?.toLowerCase() || "";
                const askLower = swap.askDenom?.toLowerCase() || "";
                const offerSym =
                  symbolMap[swap.offerDenom] || symbolMap[offerLower] || "";
                const askSym =
                  symbolMap[swap.askDenom] || symbolMap[askLower] || "";

                return (
                  offerLower.includes(searchTerm) ||
                  askLower.includes(searchTerm) ||
                  offerSym.toLowerCase().includes(searchTerm) ||
                  askSym.toLowerCase().includes(searchTerm)
                );
              })
            : result.data;

          setSwaps(filteredSwaps);
        } else {
          setSwaps([]);
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to fetch swaps";
        console.error("[fetchSwaps] Error:", errorMsg, err);
        setError(errorMsg);
        setSwaps([]);
      } finally {
        setLoading(false);
      }
    },
    [tokenId, currentPage, perPage, symbolMap]
  );

  // Wallet connection handler
  const connectWallet = useCallback(async () => {
    // console.log('[connectWallet] Attempting to connect wallet');
    setIsConnecting(true);
    setError(null);

    try {
      if (!connect) {
        throw new Error("Wallet connection not available");
      }

      await connect();

      if (walletAddr && activeTab === "My Swaps") {
        await fetchSwaps(walletAddr);
      }

      return walletAddr;
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to connect wallet";
      console.error("[connectWallet] Error:", errorMsg, err);
      setError(errorMsg);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [connect, walletAddr, activeTab, fetchSwaps]);

  // Watch for wallet address changes and fetch swaps
  useEffect(() => {
    if (walletAddr && activeTab === "My Swaps") {
      fetchSwaps(walletAddr);
    }
  }, [walletAddr, activeTab, fetchSwaps]);

  // Handle tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setError(null);
  };

  // Handle page changes
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Fetch top holders data
  const fetchTopHolders = useCallback(async () => {
    if (!tokenId) return;

    // console.log('[fetchTopHolders] Fetching top holders for token:', tokenId);
    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE}/tokens/${encodeURIComponent(
        tokenId
      )}/holders?page=${currentPage}&limit=${perPage}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json", ...API_HEADERS },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch top holders: ${response.statusText}`);
      }

      const result = await response.json();
      // console.log('[fetchTopHolders] Received holders data:', result);

      if (Array.isArray(result?.data)) {
        setHolders(result.data);
      } else {
        setHolders([]);
        console.warn("[fetchTopHolders] Unexpected data format:", result);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to fetch top holders";
      console.error("[fetchTopHolders] Error:", errorMsg, err);
      setError(errorMsg);
      setHolders([]);
    } finally {
      setLoading(false);
    }
  }, [tokenId, currentPage, perPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/tokens/swap-list?q=zig&bucket=24h&unit=usd`,
          { headers: API_HEADERS }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items: Array<{
          denom: string;
          symbol: string;
          imageUri?: string;
        }> = json?.data ?? [];
        const map: Record<string, string> = {};
        const imageMap: Record<string, string> = {};

        map["uzig"] = "ZIG";
        imageMap["uzig"] = "/zigicon.png";

        for (const it of items) {
          if (it?.denom && it?.symbol) {
            map[it.denom] = it.symbol;
            map[it.denom.toLowerCase()] = it.symbol;
            imageMap[it.denom] = it.imageUri || "/zigicon.png";
          }
        }
        if (!cancelled) {
          setSymbolMap(map);
          setTokenImageMap(imageMap);
        }
      } catch (err) {
        console.error("Error fetching token icons:", err);
        setSymbolMap({ uzig: "ZIG" });
        setTokenImageMap({ uzig: "/zigicon.png" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadIbcSymbols = async () => {
      const ibcDenoms = Array.from(
        new Set(
          swaps
            .flatMap((s) => [s.offerDenom, s.askDenom])
            .filter((d) => {
              if (typeof d !== "string") return false;
              const lower = d.toLowerCase();
              return lower.startsWith("ibc/") && !symbolMap[d] && !symbolMap[lower];
            })
        )
      );
      if (!ibcDenoms.length) return;

      const updates: Record<string, string> = {};
      const imageUpdates: Record<string, string> = {};

      await Promise.all(
        ibcDenoms.map(async (denom) => {
          try {
            const res = await fetch(
              `${API_BASE}/tokens/${encodeURIComponent(denom)}`,
              { headers: API_HEADERS }
            );
            if (!res.ok) return;
            const json = await res.json();
            const token = json?.data;
            const sym = token?.symbol;
            const img = token?.imageUri || token?.icon;
            if (sym) {
              updates[denom] = sym;
              updates[denom.toLowerCase()] = sym;
            }
            if (img) {
              imageUpdates[denom] = img;
            }
          } catch (e) {
            console.error("Error fetching IBC token meta", e);
          }
        })
      );

      if (!cancelled && (Object.keys(updates).length || Object.keys(imageUpdates).length)) {
        setSymbolMap((prev) => ({ ...prev, ...updates }));
        setTokenImageMap((prev) => ({ ...prev, ...imageUpdates }));
      }
    };

    loadIbcSymbols();
    return () => {
      cancelled = true;
    };
  }, [swaps, symbolMap]);

  /* ----------- Effects ----------- */
  // Fetch data when active tab changes
  useEffect(() => {
    if (activeTab === "My Swaps" && walletAddr) {
      fetchSwaps(walletAddr);
    } else if (activeTab === "Top Holders") {
      fetchTopHolders();
    }
  }, [activeTab, walletAddr, fetchSwaps, fetchTopHolders]);

  // Fetch data when page changes
  useEffect(() => {
    if (activeTab === "My Swaps" && walletAddr) {
      fetchSwaps(walletAddr);
    } else if (activeTab === "Top Holders") {
      fetchTopHolders();
    }
  }, [currentPage, activeTab, walletAddr, fetchSwaps, fetchTopHolders]);

  /* ----------- Handlers ----------- */

  const formatNumber = (num: number, decimals = 2) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  /* ----------- Handlers ----------- */
  const handleConnectWallet = async () => {
    const address = await connectWallet();
    if (address && activeTab === "My Swaps") {
      await fetchSwaps(address);
    }
  };

  /* ----------- UI Helpers ----------- */
  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const symbolFor = (denom?: string): string => {
    if (!denom) return "";
    const lower = denom.toLowerCase();
    if (lower.includes("uzig")) return "ZIG";
    const found = symbolMap[denom] ?? symbolMap[lower];
    if (found) return found;
    if (lower.startsWith("ibc/")) {
      const ibcPart = denom.split("/").pop() || denom;
      return ibcPart.slice(0, 6).toUpperCase();
    }
    const parts = denom.split(".");
    const last = parts[parts.length - 1] || denom;
    return last.toUpperCase();
  };

  const getTokenIcon = (denom?: string): string => {
    if (!denom) return "/zigicon.png";
    if (denom === "uzig" || denom.toLowerCase().includes("uzig"))
      return "/zigicon.png";
    return (
      tokenImageMap[denom] ||
      tokenImageMap[denom.toLowerCase?.() || ""] ||
      "/zigicon.png"
    );
  };

  // Pagination
  const indexOfLast = currentPage * perPage;
  const indexOfFirst = indexOfLast - perPage;
  const currentData =
    activeTab === "My Swaps"
      ? swaps.slice(indexOfFirst, indexOfLast)
      : holders.slice(indexOfFirst, indexOfFirst + 10);

  const totalPages = Math.ceil(
    (activeTab === "My Swaps" ? swaps.length : holders.length) / perPage
  );

  /* ----------- Render ----------- */
  return (
    <>
      <div className="border-b border-x border-[#808080]/20 rounded-b-md overflow-hidden shadow-md w-full text-white backdrop-blur-md bg-black/40">
        <div
          style={{
            backgroundImage: `linear-gradient(120deg,#000000 65%,#14624F 100%)`,
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Tabs */}
          {/* <div className="flex border-b border-white/20">
            {(["My Swaps", "Top Holders"] as TabType[]).map((tab) => (
              <button
                key={tab}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-white border-b-2 border-[#00FFA0]'
                    : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => handleTabChange(tab)}
              >
                {tab}
              </button>
            ))}
          </div> */}

          {/* Wallet Connection Status */}
          {activeTab === "My Swaps" && (
            <div className="p-4 border-b border-white/10 bg-black/20">
              {walletAddr ? (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-300">
                    Connected:{" "}
                    <span className="text-[#00FFA0]">
                      {formatAddress(walletAddr)}
                    </span>
                  </div>
                  <button
                    onClick={handleConnectWallet}
                    className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors"
                    disabled={isConnecting}
                  >
                    {isConnecting ? "Connecting..." : "Reconnect"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-sm text-gray-300">
                    Connect your wallet to view your swap history
                  </p>
                  <button
                    onClick={handleConnectWallet}
                    className="px-4 py-2 bg-[#00FFA0] hover:bg-[#00e691] text-black text-sm font-medium rounded transition-colors flex items-center gap-2"
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <>
                        <svg
                          className="animate-spin h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Connecting...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        Connect Wallet
                      </>
                    )}
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-2 p-2 text-sm text-red-400 bg-red-900/30 rounded">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div className="overflow-x-auto">
            {loading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i} className="border-b border-gray-800 animate-pulse">
                  <td className="px-4 py-2 text-left text-gray-400">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-4 py-2 text-left text-gray-400">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-4 py-2 text-left text-gray-400">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-4 py-2 text-left text-gray-400">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400">
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </td>
                </tr>
              ))
            ) : error ? (
              <div className="p-8 text-center text-red-400">
                <p>Error: {error}</p>
                <button
                  onClick={
                    activeTab === "My Swaps"
                      ? handleConnectWallet
                      : fetchTopHolders
                  }
                  className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded transition-colors"
                >
                  {activeTab === "My Swaps"
                    ? "Retry Wallet Connection"
                    : "Retry"}
                </button>
              </div>
            ) : activeTab === "My Swaps" && !walletAddr ? (
              <div className="p-8 text-center text-gray-400">
                <p>Please connect your wallet to view your swap history.</p>
              </div>
            ) : currentData.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p>
                  No {activeTab === "My Swaps" ? "swaps" : "holders"} found.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm sm:text-[0.95rem] text-white table-fixed">
                {activeTab === "My Swaps" ? (
                  <colgroup>
                    <col style={{ width: "17%" }} />
                    <col style={{ width: "19%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "23%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "15%" }} />
                  </colgroup>
                ) : (
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "47%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "15%" }} />
                  </colgroup>
                )}
                <thead className="bg-black/60 uppercase text-xs tracking-wider">
                  {activeTab === "My Swaps" ? (
                    <tr>
                      <td className="px-2.5 py-2 text-left text-gray-400">
                        Time
                      </td>
                      <td className="px-2.5 py-2 text-left text-gray-400">
                        Tx Hash
                      </td>
                      <td className="px-2.5 py-2 text-left text-gray-400">
                        Type
                      </td>
                      <td className="px-2.5 py-2 text-left text-gray-400">
                        Amount
                      </td>
                      <td className="px-2.5 py-2 text-left text-gray-400">
                        Value (USD)
                      </td>
                      <td className="px-2.5 py-2 text-left text-gray-400">
                        Action
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td className="px-3 py-2 text-left text-gray-400">
                        Rank
                      </td>
                      <td className="px-3 py-2 text-left text-gray-400">
                        Address
                      </td>
                      <td className="px-3 py-2 text-right text-gray-400">
                        Balance
                      </td>
                      <td className="px-3 py-2 text-right text-gray-400">
                        % of Supply
                      </td>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-white/10">
                  {currentData.map((item, index) =>
                    activeTab === "My Swaps" ? (
                      <tr
                        key={index}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="px-2.5 py-3 whitespace-nowrap align-top">
                          {formatDate((item as Swap).time)}
                        </td>
                        <td className="px-2.5 py-3 align-top">
                          <Link
                            href={`https://zigscan.org/tx/${
                              (item as Swap).txHash
                            }`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#00FFA0] hover:underline"
                          >
                            {(item as Swap).txHash.slice(0, 10)}...
                          </Link>
                        </td>
                        <td
                          className={`px-2.5 py-3 font-medium align-top ${
                            (item as Swap).direction === "buy"
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {(item as Swap).direction?.toUpperCase?.() ||
                            "UNKNOWN"}
                        </td>
                        <td className="px-2.5 py-3 text-left align-top">
                          <div className="flex flex-col items-start gap-1 min-w-[130px]">
                            <div className="flex items-center gap-1">
                              <Image
                                src={getTokenIcon((item as Swap).askDenom)}
                                alt="Token"
                                width={16}
                                height={16}
                                className="w-4 h-4 rounded-full"
                                unoptimized
                              />
                              <span className="text-[#20D87C] whitespace-nowrap">
                                +{formatNumber((item as Swap).returnAmount || 0, 2)}{" "}
                                {symbolFor((item as Swap).askDenom)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Image
                                src={getTokenIcon((item as Swap).offerDenom)}
                                alt="Token"
                                width={16}
                                height={16}
                                className="w-4 h-4 rounded-full"
                                unoptimized
                              />
                              <span className="text-[#F64F39] whitespace-nowrap">
                                -{formatNumber((item as Swap).offerAmount || 0, 2)}{" "}
                                {symbolFor((item as Swap).offerDenom)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 py-3 text-left align-top whitespace-nowrap">
                          $
                          {Number((item as Swap).valueUsd || 0).toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 5,
                            }
                          )}
                        </td>
                        <td className="px-2.5 py-3 text-left align-top">
                          <Link
                            href={`https://zigscan.org/tx/${
                              (item as Swap).txHash
                            }`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white hover:underline text-sm"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={index}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-3">
                          {indexOfFirst + index + 1}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/address/${(item as Holder).address}`}
                            className="text-[#00FFA0] hover:underline"
                          >
                            {formatAddress((item as Holder).address)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {Number((item as Holder).balance || 0).toLocaleString(
                            undefined,
                            {
                              maximumFractionDigits: 2,
                            }
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {Number((item as Holder).pctOfTotal || 0).toFixed(2)}%
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {/* {!loading && !error && currentData.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm rounded border border-white/20 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-300">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage >= totalPages}
                className="px-3 py-1 text-sm rounded border border-white/20 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )} */}
        </div>
      </div>
    </>
  );
};

export default MySwaps;
