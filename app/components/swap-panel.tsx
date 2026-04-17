"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { tokenAPI, API_BASE_URL, API_HEADERS } from "@/lib/api";
import AddLeft from "./add-left";
import AllSpcPairs from "./AllSpcPairs";
import { useChain } from "@cosmos-kit/react";
import dynamic from "next/dynamic";
import { ArrowRightLeft, ChevronDown, Stars, Lock } from "lucide-react";
const API_BASE = API_BASE_URL;
const CHAIN_ID = "zigchain-1";
const RPC_URL =
  process.env.RPC_URL_DEGENTER ||
  "https://zigchain-rpc.degenter.io";

// Load heavy SwapInterface only on client
const SwapInterface = dynamic(() => import("./swap-interface"), { ssr: false });

/* ---------------- TYPES ---------------- */
type Pool = {
  id?: string;
  symbol?: string;
  name?: string;
  imageUri?: string;
  priceInNative?: number;
  priceInUsd?: number;
  exponent?: number;
  liquidity?: number;
  volume?: Record<string, number>;
  fdv?: number;
  mc?: number;
  change24h?: number;
  circulatingSupply?: number;
  pairContract?: string;
  denom?: string;
  poolId?: string;
};

const fetchApi = (url: string, init: RequestInit = {}) =>
  fetch(url, {
    ...init,
    headers: { ...API_HEADERS, ...(init.headers || {}) },
  });

/* ---------------- COMPONENT ---------------- */
export default function SwapPanel({
  params,
  selectedPair,
}: {
  params: { token: string };
  selectedPair?: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
  } | null;
}) {
  // async function resolvePairBySymbol(symbol: string) {
  //   try {
  //     const res = await fetch(`${API_BASE}/tokens/swap-list`);
  //     const json = await res.json();
  //     if (!json?.data) return null;

  //     const match = json.data.find(
  //       (t: any) => t.symbol?.toLowerCase() === symbol.toLowerCase()
  //     );

  //     // Return denom as pseudo-contract substitute
  //     return match?.denom || null;
  //   } catch (err) {
  //     console.warn("Failed to fetch swap-list:", err);
  //     return null;
  //   }
  // }

  const tokenSymbol = params.token;

  const { data, isLoading, error } = useSWR<{ pool: Pool }>(
    tokenSymbol ? `token-${tokenSymbol}` : null,
    async () => {
      try {
        const res = await fetchApi(
          `${API_BASE}/tokens/${encodeURIComponent(
            tokenSymbol
          )}?priceSource=best&includePools=1`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const detail = json?.data;
        const token = detail?.token ?? detail;

        if (!token) throw new Error("No token data found");

        // Use first pool if available
        const firstPool =
          detail?.poolsDetailed?.[0] ||
          detail?.pools?.[0] ||
          token?.poolsDetailed?.[0] ||
          token?.pools?.[0] ||
          null;
        const price = detail?.price;
        const change = detail?.priceChange ?? price?.changePct;

        return {
          pool: {
            denom: token.denom,
            exponent: token.exponent,
            symbol: token.symbol,
            name: token.name,
            imageUri: token.imageUri,
            priceInNative: token.priceInNative ?? price?.native,
            priceInUsd: token.priceInUsd ?? price?.usd,
            liquidity: detail?.liquidity ?? token.liquidity,
            volume: detail?.volume ?? token.volume,
            fdv: detail?.fdv ?? token.fdv,
            mc: detail?.mc ?? token.mc,
            change24h: change?.["24h"] || 0,
            circulatingSupply:
              detail?.circulatingSupply ?? token.circulatingSupply,
            poolId: firstPool?.poolId || firstPool?.pool_id || null,
            pairContract:
              firstPool?.pairContract ||
              firstPool?.pair_contract ||
              token.denom ||
              null,
          },
        };
      } catch (err) {
        console.error("Error fetching token:", err);
        throw err;
      }
    }
  );

  const token = useMemo(() => {
    const pool = data?.pool;

    if (!pool) return null;

    const price = Number(pool.priceInNative ?? 0);

    return {
      pairContract: pool.pairContract || pool.denom,
      symbol: pool.symbol || "TOKEN",
      image: pool.imageUri || "/zigicon.png",
      priceInZigPerToken: price || 0,
      // Use nullish coalescing so we only default when exponent is null/undefined.
      // This preserves a genuine 0 exponent if present.
      exponent: pool.exponent ?? 6,
    };
  }, [data]);

  // const { data: securityData } = useSWR<{ security: Security  }>(
  //   tokenSymbol ? `security-${tokenSymbol}` : null,
  //   async () => {
  //     const res = await fetch(`${API_BASE}/tokens/${tokenSymbol}/security`);
  //     if (!res.ok) throw new Error(`HTTP ${res.status}`);
  //     const json = await res.json();
  //     const security = json?.data;
  //     if (!security) throw new Error("No security data found");

  //     return {
  //       security: {
  //         id: security.id,
  //         name: security.name,
  //         symbol: security.symbol,
  //         imageUri: security.imageUri,
  //         priceInNative: security.priceInNative,
  //         priceInUsd: security.priceInUsd,
  //         liquidity: security.liquidity,
  //         volume: security.volume,
  //         fdv: security.fdv,
  //         mc: security.mc,
  //         change24h: security.priceChange?.["24h"] || 0,
  //         circulatingSupply: security.circulatingSupply,
  //       },
  //     };
  //   }
  // );

  // const token = useMemo(() => {
  //   const pool = data?.pool;
  //   if (!pool) return null;

  //   // Ensure we have a valid contract address or fallback to denom if available
  //   let pairContract = pool.symbol;

  //   // If no pairContract but we have a poolId, use that
  //   if (!pairContract && pool.id && pool.id.startsWith('zig1')) {
  //     pairContract = pool.id;
  //   }
  //   // If still no valid contract, try using denom for native tokens
  //   else if (!pairContract && pool.symbol) {
  //     pairContract = pool.symbol;
  //   }

  //   return {
  //     pairContract: pairContract,
  //     symbol: pool.symbol || "TOKEN",
  //     image: pool.imageUri || "/default-token.png",
  //     priceInZigPerToken: Number(pool.priceInNative ?? 0),
  //     exponent: pool.exponent || 6, // Default to 6 decimals if not specified
  //   };
  // }, [data]);

  // const security = useMemo(() => {
  //   const security = securityData?.security;
  //   if (!security) return null;

  //   return {
  //     pairContract: security.symbol || tokenSymbol, // use symbol instead of pairContract
  //     symbol: security.symbol || "TOKEN",
  //     image: security.imageUri || "/default-token.png",
  //     priceInZigPerToken: Number(security.priceInNative ?? 0),
  //   };
  // }, [securityData]);

  const [showSwapOptions, setShowSwapOptions] = useState(false);
  const [showPairOptions, setShowPairOptions] = useState(false);
  const { address, connect, openView } = useChain(CHAIN_ID);

  // Close dropdown when wallet disconnects
  useEffect(() => {
    if (!address) {
      setShowSwapOptions(false);
    }
  }, [address]);

  const toggleSwapOptions = async () => {
    if (!address) {
      // alert('Please connect your wallet to use Degen Swap');
      if (openView) {
        openView();
      } else if (connect) {
        await connect();
      }
      return;
    }
    setShowSwapOptions(!showSwapOptions);
  };

  const togglePairOptions = () => {
    setShowPairOptions((v) => !v);
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="backdrop-blur-sm rounded-xl w-full lg:w-80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 w-full">
          <div
            onClick={togglePairOptions}
            className={`${
              showPairOptions ? "bg-[#1A5346]" : "bg-black/20"
            } text-white px-3 py-1 rounded-t-lg w-full text-lg font-medium flex items-center justify-between transition-colors duration-200 cursor-pointer`}
          >
            <div className="flex items-center gap-2">
              <Stars size={16} className="text-[#FA4E30]" />
              All Pairs
            </div>
            <div className="py-1 px-2 rounded-t-md">
              <ChevronDown
                size={18}
                className={`text-white/70 transition-transform duration-200 ${
                  showPairOptions ? "rotate-180" : ""
                }`}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Header */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 w-full">
          <div
            onClick={toggleSwapOptions}
            className={`${
              showSwapOptions ? "bg-[#1A5346]" : "bg-[#FA4E30]"
            } text-white px-3 py-2.5 rounded-lg w-full cursor-pointer text-[1.31rem] font-medium flex items-center justify-between transition-colors duration-200`}
          >
            <div></div>
            <div className="flex items-center gap-2 ">
              DEGEN SWAP
              <ArrowRightLeft
                size={20}
                className="text-white cursor-pointer hover:opacity-80 transition-opacity"
                onClick={toggleSwapOptions}
              />
            </div>
            <div className="bg-black/20 py-1 px-2 rounded-lg">
              <ChevronDown
                size={18}
                className={`text-white cursor-pointer hover:text-white transition-transform duration-200 ${
                  showSwapOptions ? "rotate-180" : ""
                }`}
                onClick={toggleSwapOptions}
              />
            </div>
          </div>
        </div>
      </div>
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          showPairOptions
            ? "max-h-[1200px] opacity-100 animate-in slide-in-from-top-2"
            : "max-h-0 opacity-0 animate-out slide-out-to-top-2"
        }`}
      >
        {showPairOptions && (
          <>
            {isLoading ? (
              <div className="text-center text-neutral-400 py-6">Loading…</div>
            ) : error ? (
              <div className="text-center text-red-400 py-6">
                Failed to load token
              </div>
            ) : token ? (
              <AllSpcPairs tokenKey={tokenSymbol} />
            ) : (
              <div className="text-center text-neutral-400 py-6">
                No token data.
              </div>
            )}
          </>
        )}
      </div>
      {/* Collapsible Swap Section */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          showSwapOptions
            ? "max-h-[1200px] opacity-100 animate-in slide-in-from-top-2"
            : "max-h-0 opacity-0 animate-out slide-out-to-top-2"
        }`}
      >
        {showSwapOptions && (
          <>
            {isLoading ? (
              <div className="text-center text-neutral-400 py-6">Loading…</div>
            ) : error ? (
              <div className="text-center text-red-400 py-6">
                Failed to load token
              </div>
            ) : token?.pairContract ? (
              // <SwapInterface
              //   pairContract={token.pairContract}
              //   payAsset={{
              //     type: "native",
              //     denom: "uzig",
              //     symbol: "ZIG",
              //     icon: "https://pbs.twimg.com/profile_images/1929879248212275200/Yzkbsu74_400x400.png",
              //     decimals: 6,
              //   }}
              //   receiveAsset={{
              //     type: "native",
              //     denom: token.symbol,
              //     symbol: token.symbol,
              //     icon: token.image,
              //     decimals: 6,
              //   }}
              //   chainId={CHAIN_ID}
              //   rpcUrl={RPC_URL}
              //   priceInZigPerToken={token.priceInZigPerToken}
              // />
              <SwapInterface
                apiBase={API_BASE}
                tokenSymbol={token.symbol} // "HELLO"
                tokenDenom={token.pairContract} // "coin.zig1... .uzm"  ✅ not the symbol
                tokenDecimals={token.exponent} // 6
                tokenIcon={token.image}
                chainId={CHAIN_ID}
                rpcUrl={RPC_URL}
                selectedPair={selectedPair}
              />
            ) : (
              <div className="text-center text-red-400 py-6">
                No valid swap pair found for {token?.symbol}.
              </div>
            )}
          </>
        )}
      </div>

      {/* Token Info Section (existing AddLeft panel) */}
      <AddLeft />
    </div>
  );
}
