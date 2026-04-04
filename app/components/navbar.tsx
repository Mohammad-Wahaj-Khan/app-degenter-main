// app/components/Navbar.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Lock, Menu, Search, X } from "lucide-react";
import Image from "next/image";
import { createPortal } from "react-dom";

// Assets (design unchanged)
import WalletImg from "../../public/wallet.svg";
import ProfileImg from "../../public/profile.svg";
import LOGO from "../../public/degenterminalLogo.svg";
import dynamic from "next/dynamic";

// Dynamically import SearchBar with no SSR to avoid window/document issues
const SearchBar = dynamic(() => import("./search-bar"), { ssr: false });

// ---- CosmosKit (wallet) ----
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "../config/chain";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

/* ============================== Types ============================== */
type ResultType = "token";
type SearchResult = {
  id: string;
  name: string;
  symbol?: string;
  type: ResultType;
  icon?: string;
  price?: number;
};

interface Token {
  tx: number;
  id: string; // pair_contract
  name: string;
  symbol: string;
  icon: string | null;
  price: number; // zig price of primary denom
  liquidity: number;
  marketCap: number;
  volume24: number;
  volume24Buy: number;
  volume24Sell: number;
  volume24Pct: number; // ((buy - sell)/(buy+sell))*100
  txCount: number;
}

/* ====================== Pools dataset (singleton) ====================== */
const POOL_STORE: { loaded: boolean; tokens: Token[] } = {
  loaded: false,
  tokens: [],
};

async function fetchAllPoolsOnce(): Promise<Token[]> {
  if (POOL_STORE.loaded) return POOL_STORE.tokens;

  try {
    const response = await fetch(
      `${API_BASE}/tokens?bucket=24h&priceSource=best&sort=volume&dir=desc&includeChange=1&limit=500`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("Failed to fetch tokens:", response.statusText);
      return [];
    }

    const json = await response.json();
    if (!json.success || !Array.isArray(json.data)) {
      console.error("Invalid API response format");
      return [];
    }

    const tokens: Token[] = json.data
      .filter((token: any) => {
        const tokenName = (token.name || "").toLowerCase();
        return tokenName !== "zig" && tokenName !== "uzig";
      })
      .map((token: any) => ({
        id: token.denom || token.tokenId,
        name: token.name || "Unknown Token",
        symbol: token.symbol || "UNKNOWN",
        icon: token.imageUri || null,
        price: token.priceNative || 0,
        tx: token.tx || 0,
        marketCap: token.mcapNative || 0,
        volume24: token.volNative || 0,
        volume24Buy: token.volBuyNative || 0,
        volume24Sell: token.volSellNative || 0,
        volume24Pct: token.change24hPct || 0,
        txCount: token.tx || 0,
      }));

    POOL_STORE.tokens = tokens;
    POOL_STORE.loaded = true;
    return tokens;
  } catch (error) {
    console.error("Error fetching tokens:", error);
    return [];
  }
}

/* ============================ Debounce hook ============================ */
function useDebounce<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ============================= Recent storage ============================= */
const RECENT_KEY = "dt:recent-searches";
function getRecent(): SearchResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as SearchResult[]) : [];
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch {
    return [];
  }
}
/* ================================ Navbar ================================ */
export default function Navbar() {
  const router = useRouter();

  // Search states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataset, setDataset] = useState<Token[]>([]);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const debounced = useDebounce(modalQuery, 150);
  // Add this near other state declarations
  const [selectedTokenPools, setSelectedTokenPools] = useState<any[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [loadingPools, setLoadingPools] = useState(false);
  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Token[]>([]);
  // Refs for input elements
  const inputRefModal = useRef<HTMLInputElement>(null);

  // Wallet (unchanged behavior)
  const { address, connect, disconnect, openView } = useChain(
    (CHAIN_NAME as string) || "zigchain-1"
  );

  // Load wallet connection on initial render
  useEffect(() => {
    const savedWallet =
      typeof window !== "undefined"
        ? localStorage.getItem("connectedWallet")
        : null;
    if (savedWallet && !address) connect?.().catch(() => {});
  }, [connect, address]);

  // Persist connection state
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (address) localStorage.setItem("connectedWallet", "true");
    else localStorage.removeItem("connectedWallet");
  }, [address]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea") {
        e.preventDefault();
        openSearchModal();
      }
      if (e.key === "Escape") {
        setModalOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // lock body scroll while modal or mobile menu open
  useEffect(() => {
    if (!modalOpen && !mobileMenuOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [modalOpen, mobileMenuOpen]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (
        !target.closest(".mobile-menu") &&
        !target.closest(".mobile-menu-button")
      ) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen]);

  // Fetch dataset once for modal (trending + search)
  useEffect(() => {
    if (!modalOpen || dataset.length) return;
    (async () => {
      setLoading(true);
      const tokens = await fetchAllPoolsOnce();
      setDataset(tokens);
      setRecent(getRecent());
      setLoading(false);
      setTimeout(() => inputRefModal.current?.focus(), 0);
    })();
  }, [modalOpen, dataset.length]);

  const openSearchModal = () => {
    setModalOpen(true);
    setModalQuery("");
    setActiveIndex(-1);
    setSelectedToken(null);
    setSelectedTokenPools([]);
    setSearchResults([]);
  };

  /* =========================== Wallet UI =========================== */
  const formatAddr = (a?: string | null) =>
    a ? `${a.slice(0, 4)}...${a.slice(-4)}` : "";
  // In navbar.tsx

  // Update the wallet connection effect
  useEffect(() => {
    const initWallet = async () => {
      try {
        const savedWallet = localStorage.getItem("connectedWallet");
        if (savedWallet && !address && connect) {
          await connect();
        }
      } catch (error) {
        console.error("Error initializing wallet:", error);
        localStorage.removeItem("connectedWallet");
      }
    };

    initWallet();
  }, [connect, address]);

  // Update the wallet click handler
  const handleWalletClick = async () => {
    try {
      if (address) {
        await disconnect();
      } else if (openView) {
        openView();
      } else if (connect) {
        await connect();
      }
    } catch (e) {
      console.error("Wallet error:", e);
    }
  };

  // Update the wallet connection state effect
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (address) {
        localStorage.setItem("connectedWallet", "true");
      } else {
        // Only remove if the disconnection was intentional
        const currentPath = window.location.pathname;
        if (!currentPath.includes("token/")) {
          localStorage.removeItem("connectedWallet");
        }
      }
    }
  }, [address]);

  /* ================================ Render ================================ */
  return (
    <header className=" top-0 z-50 w-full">
      <div className="relative mx-auto w-full max-w-screen-6xl justify-between lg:justify-center px-6 lg:px-6 xl:px-8">
        {/* Single row as 3-column grid for perfect alignment */}
        <div className="flex justify-between items-center gap-4 sm:gap-3 lg:gap-4 py-3 sm:py-4 md:py-5 lg:py-6">
          {/* Left group: Logo + Search */}
          <div className="flex items-start gap-2 sm:gap-3 min-w-0 mr-4 sm:mr-0">
            {/* Mobile toggle button */}
            <button
              className="mobile-menu-button lg:hidden px-2 text-white"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            {/* Logo */}
            <Link href="/" className="select-none shrink-0">
              <Image
                src={LOGO}
                alt="DEGEN Terminal"
                width={160}
                height={32}
                className="block h-7 xs:h-8 sm:h-9 md:h-10 w-auto"
                priority
              />
            </Link>

            {/* Desktop search bar */}
            <div className="hidden lg:block w-full max-w-[520px] ml-0 sm:ml-6 lg:ml-10">
              <SearchBar
                isOpen={modalOpen}
                onOpen={openSearchModal}
                onClose={() => setModalOpen(false)}
                placeholder="Search for Token, Markets, Wallets..."
              />
            </div>
          </div>

          <div className="justify-self-end flex items-center gap-4 lg:gap-8 shrink-0">
            <nav className="hidden lg:flex items-center justify-end gap-4 xl:gap-8">
              <div className="flex items-center gap-4 xl:gap-10">
                <Link href="/createtoken">
                  <NavItem label="Create Token" blink />
                </Link>
                {/* <NavItem label="Find Traders" hasDropdown />
                <NavItem label="Explore" hasDropdown /> */}
                <NavItem label="Earn" hasDropdown />
                <NavItem label="Terminal" hasDropdown />
                <NavItem label="Resources" hasDropdown />
                {/* <LeaderboardNavItem /> */}
                <Link href="https://leaderboard.degenter.io" target="_blank">
                  <NavItem label="Leaderboard" blink/>
                </Link>
              </div>
              {/* <div className="text-[1rem] flex items-center gap-1 xl:text-[1rem] font-normal text-white/90 py-1.5 rounded-full whitespace-nowrap">
              <HiBolt size={14} color="#FA4E30"/>
                PRO
              </div> */}
            </nav>

            <div className="flex items-center gap-3 sm:gap-2 md:gap-3">
              {/* 
              <button
                className="rounded-lg text-white transition "
                aria-label="Portfolio"
              >
                <Link href="/portfolio">                
                <Image
                  src={ProfileImg}
                    alt="Profile"
                    width={22}
                    height={22}
                    className="w-5 h-5 object-contain select-none"
                    draggable={false}
                /></Link>
              </button>
              <span aria-hidden className="mx-2 sm:mx-1 h-5 w-[1px] bg-white" /> */}
              {!address ? (
                <button
                  onClick={handleWalletClick}
                  className="relative h-[44px] w-auto"
                  title="Connect Wallet"
                >
                  <Image
                    src={WalletImg}
                    alt="Connect Wallet"
                    width={22}
                    height={22}
                    className="w-5 h-5 object-contain select-none"
                    draggable={false}
                  />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <div
                    onClick={() => {
                      navigator.clipboard.writeText(address);
                      // Add toast/notification here if needed
                    }}
                    title="Click to copy address"
                    className="flex flex-col items-end cursor-pointer"
                  >
                    <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-[#24242480] border border-[#808080]/20 ">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <span className="text-white text-xs sm:text-sm font-medium">
                        {formatAddr(address)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleWalletClick}
                    className="p-1.5 sm:p-2 rounded-lg  transition-colors"
                    title="Disconnect"
                  >
                    <X size={16} className="text-gray-300 hover:text-white" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ======================= Mobile Navigation Menu ======================= */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          {/* Semi-transparent overlay */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="mobile-menu relative z-[71] flex flex-col w-4/5 max-w-[320px] h-full bg-[#0c0c0c]/95 border-r border-white/10 animate-slideIn">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <Image src={LOGO} alt="DEGEN Terminal" width={120} height={24} />
              <button
                className="p-2 text-white"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>

            {/* Search bar (trigger only) */}
            <div className="p-4 border-b border-white/10">
              <SearchBar
                isOpen={false}
                onOpen={() => {
                  setMobileMenuOpen(false);
                  openSearchModal();
                }}
                onClose={() => setModalOpen(false)}
              />
            </div>

            {/* Navigation links */}
            <nav className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-4">
              <Link href="/createtoken">
                <NavItem label="Create Token" blink />
              </Link>
              {/* <NavItem label="Find Traders" hasDropdown /> */}
              {/* <NavItem label="Explore" hasDropdown /> */}
              <NavItem label="Earn" hasDropdown />
              <NavItem label="Terminal" hasDropdown />
              <NavItem label="Resources" hasDropdown />
              {/* <LeaderboardNavItem mobile /> */}
              <Link href="https://leaderboard.degenter.io" target="_blank">
                <NavItem label="Leaderboard" blink />
              </Link>
              <Link
                href="http://zigscan.org/"
                target="_blank"
                className="mt-4 text-center border border-white/10 rounded-lg py-2 text-white hover:bg-white/10 transition"
              >
                Launch Explorer
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

/* ---------- Subcomponents ---------- */
function NavItem({
  label,
  hasDropdown,
  blink,
}: {
  label: string;
  hasDropdown?: boolean;
  blink?: boolean;
}) {
  return (
    <div className="relative group text-white text-sm">
      <div className="flex items-center gap-2 cursor-pointer hover:text-gray-300 transition">
        <span className="whitespace-nowrap">{label}</span>
        {blink && (
          <span
            className="relative ml-2 flex h-4 w-2 items-center"
            aria-label="New"
            title="New"
          >
            <span className="absolute inline-flex h-2 w-2 rounded-full bg-[#FA4E30] opacity-75"></span>
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-[#FA4E30]"></span>
          </span>
        )}
        {hasDropdown && <Lock size={14} />}
      </div>
    </div>
  );
}

function LeaderboardNavItem({ mobile }: { mobile?: boolean }) {
  const badgeWidth = 35;
  const badgeHeight = 18;
  return (
    <Link
      href="https://leaderboard.degenter.io"
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-2 ${mobile ? "px-2 py-1" : ""}`}
    >
      <NavItem label="Leaderboard" />
      <span className="flex-shrink-0">
        <Image
          src="/newimg.svg"
          alt="New leaderboard badge"
          width={badgeWidth}
          height={badgeHeight}
          className="h-4 w-auto select-none leaderboard-badge"
          draggable={false}
          priority
        />
      </span>
    </Link>
  );
}
