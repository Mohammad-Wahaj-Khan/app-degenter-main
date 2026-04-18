"use client";

import { useEffect, useState } from "react";
import { FaTelegramPlane } from "react-icons/fa";
import { BsTwitterX } from "react-icons/bs";
import { HiGlobeAsiaAustralia } from "react-icons/hi2";
import { useParams } from "next/navigation";
import TokenStats from "./TokenStats";
import Link from "next/link";
import Image from "next/image";
import { useTokenSummary } from "@/app/hooks/useTokenSummary";
import {
  tokenAPI,
  type TokenDetailResponse,
  API_BASE_URL,
  API_HEADERS,
} from "@/lib/api";

const API_BASE = API_BASE_URL.replace(/\/+$/, "");

const normalizePairValue = (value?: string | null) =>
  (value ?? "").trim().toLowerCase();

const normalizeTokenValue = (value?: string | null) => {
  const raw = (value ?? "").trim().toLowerCase();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const isZigAsset = (value?: string | null) => {
  const normalized = normalizePairValue(value);
  return normalized === "zig" || normalized === "uzig";
};

const isLikelyPairContract = (value?: string | null) =>
  normalizePairValue(value).startsWith("zig1");

const isZigSelectedPair = (
  selectedPair?: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    poolId?: string | null;
  } | null
) =>
  isZigAsset(selectedPair?.baseSymbol) ||
  isZigAsset(selectedPair?.quoteSymbol) ||
  isZigAsset(selectedPair?.baseDenom) ||
  isZigAsset(selectedPair?.quoteDenom);

/* ---------------- Types ---------------- */
interface Token {
  id: number;
  denom?: string;
  name: string;
  symbol: string;
  display?: string;
  description: string;
  icon: string | null;
  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
  createdAt?: string | null;
  socials?: {
    twitter?: {
      handle?: string;
      userId?: string;
      name?: string;
      isBlueVerified?: boolean;
      verifiedType?: string | null;
      profilePicture?: string;
      coverPicture?: string;
      followers?: number;
      following?: number;
      createdAtTwitter?: string;
      lastRefreshed?: string;
    };
  };
}

/* ---------------- Helpers ---------------- */
const isNumericTokenKey = (value?: string | null) =>
  Boolean(value && /^[0-9]+$/.test(value));

const findIbcMeta = async (denom: string) => {
  try {
    const res = await fetch(
      `${API_BASE}/tokens/swap-list?bucket=24h&unit=usd`,
      {
        headers: API_HEADERS,
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const match =
      json?.data?.find(
        (t: { denom?: string }) =>
          typeof t?.denom === "string" &&
          t.denom.toLowerCase() === denom.toLowerCase()
      ) || null;
    return match
      ? {
          symbol: match.symbol as string | undefined,
          imageUri: match.imageUri as string | undefined,
        }
      : null;
  } catch (err) {
    console.error("Error fetching IBC meta:", err);
    return null;
  }
};

const resolveTokenKeyFromId = async (tokenId: string) => {
  try {
    const res = await fetch(
      `${API_BASE}/tokens/swap-list?bucket=24h&unit=usd`,
      {
        headers: API_HEADERS,
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const match =
      json?.data?.find(
        (t: { tokenId?: string | number }) =>
          String(t?.tokenId ?? "") === String(tokenId)
      ) || null;
    if (!match) return null;
    return (match.denom ||
      match.symbol ||
      match.display ||
      match.name ||
      null) as string | null;
  } catch (err) {
    console.error("Error resolving token by id:", err);
    return null;
  }
};

/* ---------------- Fetch Token ---------------- */
async function fetchTokenBySymbol(
  symbol: string,
  options: { poolId?: string | null } = {}
): Promise<Token | null> {
  try {
    if (symbol.toLowerCase().startsWith("zig1")) {
      const resolved = await resolvePairContractToToken(symbol);
      if (resolved && resolved !== symbol) {
        return fetchTokenBySymbol(resolved, options);
      }
      return null;
    }
    const json = await tokenAPI.getTokenDetailsBySymbol(
      symbol,
      options.poolId ? "pool" : "best",
      true,
      {},
      options.poolId
    );
    if (!json?.success || !json?.data) {
      console.error("API returned unsuccessful response:", json);
      return null;
    }

    const payload = json.data;
    const t = payload?.token;
    if (!t) {
      console.error("No data in API response");
      return null;
    }

    if (
      t.denom &&
      normalizeTokenValue(t.denom) !== normalizeTokenValue(symbol)
    ) {
      return fetchTokenBySymbol(t.denom, options);
    }

    // Extract Twitter data from response
    const twitterData =
      (typeof json?.twitter === "object" && json.twitter ? json.twitter : {}) ||
      {};
    const twitterHandle =
      t.twitter
        ?.replace("https://x.com/", "")
        .replace("https://twitter.com/", "") ||
      json?.twitter?.handle ||
      undefined;

    const twitterUrl = twitterHandle
      ? twitterHandle.startsWith("http")
        ? twitterHandle
        : `https://x.com/${twitterHandle}`
      : null;

    let derivedSymbol = t.symbol || "";
    let derivedIcon = t.imageUri || null;
    const display = t.display || t.denom || symbol;
    const derivedDenom = t.denom || derivedSymbol || symbol;

    if (symbol.toLowerCase().startsWith("ibc/")) {
      const ibcMeta = await findIbcMeta(symbol);
      if (ibcMeta?.symbol) derivedSymbol = ibcMeta.symbol;
      if (ibcMeta?.imageUri) derivedIcon = ibcMeta.imageUri;
      if (!derivedSymbol) {
        const parts = symbol.split("/");
        derivedSymbol = (parts[parts.length - 1] || symbol).toUpperCase();
      }
    }

    return {
      id: Number(t.tokenId || 0),
      denom: derivedDenom,
      name: t.name || "Unknown",
      symbol: derivedSymbol,
      display,
      description:
        t.description || t.name || "Hello everyone! This is a Degenter token.",
      icon: derivedIcon,
      twitter: twitterUrl,
      telegram: t.telegram ?? null,
      website: t.website ?? null,
      createdAt: t.createdAt ?? null,
      socials: {
        twitter: {
          handle: twitterData.handle || twitterHandle?.replace("@", ""),
          userId: twitterData.userId,
          name: twitterData.name,
          isBlueVerified: twitterData.isBlueVerified,
          verifiedType: twitterData.verifiedType,
          profilePicture: twitterData.profilePicture,
          coverPicture: twitterData.coverPicture,
          followers: twitterData.followers,
          following: twitterData.following,
          createdAtTwitter: twitterData.createdAtTwitter,
          lastRefreshed: twitterData.lastRefreshed,
        },
      },
    };
  } catch (err) {
    console.error("Error fetching token:", err);
    return null;
  }
}

async function resolvePairContractToToken(pairContract: string) {
  try {
    const res = await fetch(
      `${API_BASE}/tokens/${encodeURIComponent(pairContract)}/pools`,
      { headers: API_HEADERS }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const pool = json?.data?.[0] || null;
    return (
      pool?.base?.denom ||
      pool?.quote?.denom ||
      pool?.base?.tokenId ||
      pool?.quote?.tokenId ||
      json?.token?.denom ||
      json?.token?.tokenId ||
      null
    );
  } catch (err) {
    console.error("Error resolving pair contract:", err);
    return null;
  }
}

/* ---------------- Skeleton Loader ---------------- */
// Skeleton loader component
const SkeletonLoader = () => (
  <div className="animate-pulse space-y-4 p-4">
    {/* Header with token info */}
    <div className="flex items-center space-x-4">
      <div className="h-16 w-16 rounded-full bg-gray-700"></div>
      <div className="flex-1 space-y-2">
        <div className="h-6 w-3/4 bg-gray-700 rounded"></div>
        <div className="h-4 w-1/2 bg-gray-700 rounded"></div>
      </div>
    </div>

    {/* Stats grid */}
    <div className="grid grid-cols-2 gap-4 pt-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-gray-700 rounded w-3/4"></div>
          <div className="h-6 bg-gray-700 rounded w-full"></div>
        </div>
      ))}
    </div>

    {/* Price chart placeholder */}
    <div className="h-40 bg-gray-700 rounded-lg mt-4"></div>
  </div>
);

/* ---------------- Component ---------------- */
export default function AddLeft({
  selectedPair,
}: {
  selectedPair?: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    pairContract?: string | null;
    poolId?: string | null;
  } | null;
} = {}) {
  const [error, setError] = useState<string | null>(null);
  const { tokenDetails } = useParams();
  const [token, setToken] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);

  // Log token data when it changes
  useEffect(() => {
    if (token) {
      // console.log("Token Data:", JSON.stringify(token, null, 2));
      if (token.socials?.twitter) {
        // console.log(
        //   "Twitter Data:",
        //   JSON.stringify(token.socials.twitter, null, 2)
        // );
      }
    }
  }, [token]);
  const [resolvedTokenKey, setResolvedTokenKey] = useState<string | null>(null);
  const [summaryFallback, setSummaryFallback] = useState<
    TokenDetailResponse["data"] | null
  >(null);
  const tokenParts = Array.isArray(tokenDetails)
    ? tokenDetails
    : [tokenDetails];
  const tokenKey = tokenParts[0];
  const baseSymbolFromRoute = tokenParts[0] ?? null;
  const quoteSymbolFromRoute = tokenParts[1] ?? null;
  const routePairContract = isLikelyPairContract(quoteSymbolFromRoute)
    ? quoteSymbolFromRoute
    : null;
  const selectedPairFromRoute: {
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    baseDenom?: string | null;
    quoteDenom?: string | null;
    pairContract?: string | null;
    poolId?: string | null;
  } | null =
    baseSymbolFromRoute && quoteSymbolFromRoute
      ? {
          baseDenom: baseSymbolFromRoute,
          quoteDenom: routePairContract ? null : quoteSymbolFromRoute,
          pairContract: routePairContract,
        }
      : null;
  const effectiveSelectedPair = selectedPair ?? selectedPairFromRoute;
  const summaryTokenKey =
    token?.denom ||
    (!isZigAsset(effectiveSelectedPair?.baseDenom)
      ? effectiveSelectedPair?.baseDenom
      : null) ||
    (!isZigAsset(effectiveSelectedPair?.quoteDenom)
      ? effectiveSelectedPair?.quoteDenom
      : null) ||
    resolvedTokenKey ||
    token?.display ||
    token?.symbol ||
    tokenKey;
  const selectedPoolId = effectiveSelectedPair?.poolId ?? null;
  const shouldUsePoolPricing =
    Boolean(selectedPoolId) && !isZigSelectedPair(effectiveSelectedPair);
  const { data: summaryData } = useTokenSummary({
    tokenId: shouldUsePoolPricing ? null : token?.id,
    tokenKey: shouldUsePoolPricing ? null : summaryTokenKey,
  });
  const summary = shouldUsePoolPricing ? summaryFallback : summaryData ?? summaryFallback;

  const formatCompact = (value?: number, prefix = "$") => {
    if (value == null || !Number.isFinite(value)) return "—";
    return `${prefix}${Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value)}`;
  };

  const priceUsd = summary?.price?.usd ?? summary?.priceInUsd ?? undefined;
  const change24h =
    summary?.priceChange?.["24h"] ?? summary?.price?.changePct?.["24h"];
  const changeLabel =
    change24h == null || !Number.isFinite(change24h)
      ? "—"
      : `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`;
  const changeClass =
    change24h != null && Number.isFinite(change24h)
      ? change24h >= 0
        ? "text-green-400"
        : "text-red-400"
      : "text-gray-300";
  const twitterHandle =
    token?.socials?.twitter?.handle ||
    token?.socials?.twitter?.userId ||
    (token?.twitter
      ? token.twitter
          .replace(/^https?:\/\/(www\.)?x\.com\//, "")
          .replace(/^https?:\/\/(www\.)?twitter\.com\//, "")
      : null);
  const followers = token?.socials?.twitter?.followers;
  const following = token?.socials?.twitter?.following;
  // Set fallback images
  const fallbackBgImage = "/BgImage.png";
  const fallbackProfileImage = "/profileimg.svg";

  // Handle cover image with fallback
  const coverImage = token?.socials?.twitter?.coverPicture || fallbackBgImage;

  // Handle profile image with fallback
  const profileImage =
    token?.socials?.twitter?.profilePicture ||
    token?.icon ||
    fallbackProfileImage;

  useEffect(() => {
    if (!tokenKey) {
      setResolvedTokenKey(null);
      return;
    }

    if (!isNumericTokenKey(tokenKey)) {
      setResolvedTokenKey(tokenKey);
      return;
    }

    let active = true;
    resolveTokenKeyFromId(tokenKey)
      .then((resolved) => {
        if (!active) return;
        setResolvedTokenKey(resolved || tokenKey);
      })
      .catch(() => {
        if (!active) return;
        setResolvedTokenKey(tokenKey);
      });

    return () => {
      active = false;
    };
  }, [tokenKey]);

  useEffect(() => {
    if (!tokenDetails) return;
    if (!summaryTokenKey) return;

    const loadToken = async () => {
      setLoading(true);
      setError(null);
      try {
        const t = await fetchTokenBySymbol(summaryTokenKey, {
          poolId: shouldUsePoolPricing ? selectedPoolId : null,
        });
        if (!t) {
          setError("Token not found");
        }
        setToken(t);
      } catch (err) {
        console.error("Failed to fetch token:", err);
        setError("Failed to load token data");
      } finally {
        setLoading(false);
      }
    };

    loadToken();
  }, [selectedPoolId, shouldUsePoolPricing, tokenDetails, summaryTokenKey]);

  useEffect(() => {
    if (!summaryTokenKey || summaryData) return;
    setSummaryFallback(null);
    let active = true;
    tokenAPI
      .getTokenDetailsBySymbol(
        summaryTokenKey,
        shouldUsePoolPricing ? "pool" : "best",
        true,
        {},
        shouldUsePoolPricing ? selectedPoolId : null
      )
      .then((res) => {
        if (!active) return;
        if (res?.data) setSummaryFallback(res.data);
      })
      .catch((err) => {
        console.error("Failed to load token summary fallback:", err);
      });
    return () => {
      active = false;
    };
  }, [selectedPoolId, shouldUsePoolPricing, summaryTokenKey, summaryData]);

  /* ---------------- UI ---------------- */
  return (
    <div className="backdrop-blur-sm rounded-xl w-full lg:w-80 mx-auto">
      {/* Token profile */} 
   {loading ? (
        <SkeletonLoader />
      ) : error ? (
        <div className="p-4 text-center text-red-400">{error}</div>
      ) : token?.socials?.twitter?.coverPicture &&
        token?.socials?.twitter?.profilePicture ? (
          <div className="rounded-lg mt-3 overflow-hidden bg-black/20 border border-[#ffffff22] shadow-md">
          {/* Cover Photo */}
          <div
            className="relative w-full h-32 bg-center bg-cover"
            style={{
              backgroundImage: `url('${token.socials.twitter.coverPicture}')`,
            }}
          >
            {/* Profile Picture */}
            <div className="absolute -bottom-8 left-[50px] transform -translate-x-1/2">
              <Image
                src={token.socials.twitter.profilePicture}
                alt="profile"
                width={64}
                height={64}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-black shadow-lg object-cover"
              />
            </div>
          </div>

          {/* Profile Info */}
          <div className="pt-10 px-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <h2 className="text-lg font-bold text-white">
                    {token.socials.twitter.name || token.name}
                  </h2>
                  {token.socials.twitter.isBlueVerified && (
                    <svg
                      className="w-4 h-4 text-blue-400"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-label="Verified account"
                    >
                      <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.929.084-1.352.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.42-.165-.88-.25-1.353-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.02-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.164.865.25 1.336.25 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                    </svg>
                  )}
                </div>
                <p className="text-gray-400 text-sm">
                  @{token.socials.twitter.handle}
                </p>
              </div>
            <div className="flex gap-2">
              {token.telegram && (
                <a
                    href={token.telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-black/50 p-2 rounded-full hover:bg-black/70 transition"
                  >
                    <FaTelegramPlane size={15} className="text-white" />
                  </a>
                )}
                {token.twitter && (
                  <a
                    href={token.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-black/50 p-2 rounded-full hover:bg-black/70 transition"
                  >
                    <BsTwitterX size={13} className="text-white" />
                  </a>
                )}
                {token.website && (
                  <a
                    href={token.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-black/50 p-2 rounded-full hover:bg-black/70 transition"
                  >
                    <HiGlobeAsiaAustralia size={15} className="text-white" />
                  </a>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-4 mt-3 text-sm text-gray-300">
              {token.socials.twitter.followers !== undefined && (
                <div className="flex items-center gap-1">
                  <span className="font-medium text-white">
                    {new Intl.NumberFormat("en-US", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(token.socials.twitter.followers)}
                  </span>
                  <span>Followers</span>
                </div>
              )}
              {token.socials.twitter.following !== undefined && (
                <div className="flex items-center gap-1">
                  <span className="font-medium text-white">
                    {token.socials.twitter.following.toLocaleString()}
                  </span>
                  <span>Following</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ✅ Case 2: Default fallback block */
        <div
          className="rounded-lg p-2 mt-3 bg-cover bg-center bg-no-repeat h-32 w-full"
          style={{
            backgroundImage: "url('/defaultframe.png')",
          }}
        >
          <div className="flex gap-2 justify-center mb-2">
            <div className="flex-col items-center justify-center uppercase">
              <h3 className="text-white font-medium text-[1.5rem] text-center">
                {token?.name}
              </h3>
              <p className="text-white text-[0.7rem] text-center max-w-full px-2 break-words line-clamp-2">
                {token?.description}
              </p>
            </div>
          </div>
            <div className="flex gap-2 justify-center">
              <span className="bg-black/50 px-2 py-1 rounded-[0.3rem]">
                <FaTelegramPlane size={14} />
                {token?.telegram}
                {token?.telegram && (
                  <Link href={token.telegram} target="_blank">
                    <HiGlobeAsiaAustralia size={15} className="text-white" />
                  </Link>
                )}
              </span>
            <span className="bg-black/50 px-2 py-1 rounded-[0.3rem]">
              <BsTwitterX size={12} />
              {token?.twitter && (
                <Link href={token.twitter} target="_blank">
                  <HiGlobeAsiaAustralia size={15} className="text-white" />
                </Link>
              )}
            </span>
            <span className="bg-black/50 px-2 py-1 rounded-[0.3rem]">
              <HiGlobeAsiaAustralia size={14} />
              {token?.website && (
                <Link href={token.website} target="_blank">
                  <HiGlobeAsiaAustralia size={15} className="text-white" />
                </Link>
              )}
            </span>
          </div>
        </div>
      )}

      {/* ✅ Token Stats Section */}
      <div className="mt-3">
        {token ? (
          <TokenStats
            tokenId={token.id}
            tokenKey={summaryTokenKey}
            summaryData={summary}
            selectedPair={effectiveSelectedPair}
          />
        ) : loading ? (
          <div className="text-gray-400 text-center py-4">
            Loading token info…
          </div>
        ) : (
          <div className="text-gray-500 text-center py-3">
            No token data found
          </div>
        )}
      </div>
    </div>
  );
}
