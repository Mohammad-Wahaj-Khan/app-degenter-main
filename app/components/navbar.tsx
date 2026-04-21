// app/components/Navbar.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Lock, Menu, Search, X } from "lucide-react";
import {
  FaSearch,
  FaGem,
  FaLink,
  FaTrophy,
  FaMap,
  FaChartLine,
  FaPlusCircle,
} from "react-icons/fa";
import Image from "next/image";
import { createPortal } from "react-dom";

// Assets (design unchanged)
import WalletImg from "../../public/wallet.svg";
import ProfileImg from "../../public/profile.svg";
import ProfilePIC from "../../public/profile.png";
import LOGO from "../../public/degenterminalLogo.svg";
import dynamic from "next/dynamic";

// Dynamically import SearchBar with no SSR to avoid window/document issues
const SearchBar = dynamic(() => import("./search-bar"), { ssr: false });

// ---- CosmosKit (wallet) ----
import { useChain } from "@cosmos-kit/react";
import { CHAIN_NAME } from "../config/chain";
import { API_BASE_URL, API_KEY } from "@/lib/api";

const API_BASE = API_BASE_URL;
const PROFILE_FOCUS_SEEN_KEY = "degenterProfileFocusSeen";
const LEADERBOARD_CLOSED_KEY = "degenterLeaderboardPopupClosed";
const LEADERBOARD_CLOSED_EVENT = "degenter:leaderboard-closed";
const GUEST_HANDLE_KEY = "degenterGuestProfileHandle";

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
      `${API_BASE}/tokens?bucket=24h&priceSource=best&sort=volume&dir=desc&includeChange=1&limit=100&offset=0`,
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
  const pathname = usePathname();

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
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const [showProfileIntro, setShowProfileIntro] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [profileExists, setProfileExists] = useState(false);
  const [guestHandle, setGuestHandle] = useState("");
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(PROFILE_FOCUS_SEEN_KEY) === "1") return;

    const showIntroIfReady = () => {
      if (localStorage.getItem(PROFILE_FOCUS_SEEN_KEY) === "1") return;
      if (localStorage.getItem(LEADERBOARD_CLOSED_KEY) === "1") {
        setShowProfileIntro(true);
      }
    };

    showIntroIfReady();

    const handleLeaderboardClose = () => {
      showIntroIfReady();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === PROFILE_FOCUS_SEEN_KEY && event.newValue === "1") {
        setShowProfileIntro(false);
      }
      if (event.key === LEADERBOARD_CLOSED_KEY && event.newValue === "1") {
        showIntroIfReady();
      }
    };

    window.addEventListener(LEADERBOARD_CLOSED_EVENT, handleLeaderboardClose);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        LEADERBOARD_CLOSED_EVENT,
        handleLeaderboardClose
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!showProfileIntro) return;
    profileButtonRef.current?.focus({ preventScroll: true });
  }, [showProfileIntro]);

  useEffect(() => {
    if (!showProfileIntro) return;
    if (typeof window === "undefined") return undefined;
    const timer = window.setTimeout(() => {
      setShowProfileIntro(false);
      if (typeof window !== "undefined") {
        localStorage.setItem(PROFILE_FOCUS_SEEN_KEY, "1");
      }
    }, 22000);
    return () => window.clearTimeout(timer);
  }, [showProfileIntro]);

  const dismissProfileIntro = () => {
    setShowProfileIntro(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(PROFILE_FOCUS_SEEN_KEY, "1");
    }
  };

  const apiKey = API_KEY || "";

  // Handle profile click with wallet check
  const handleProfileClick = (e: React.MouseEvent) => {
    e.preventDefault();

    // Dismiss profile intro if it's open
    if (showProfileIntro) {
      dismissProfileIntro();
      return;
    }

    if (!address) {
      setShowProfileIntro(true);
      return;
    }

    const query = `handle=${address}`;
    router.push(`/profile?${query}`);
  };

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadGuestHandle = () => {
      const storedHandle = localStorage.getItem(GUEST_HANDLE_KEY) || "";
      setGuestHandle(storedHandle);
    };
    loadGuestHandle();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === GUEST_HANDLE_KEY) {
        setGuestHandle(event.newValue || "");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const handle = address || guestHandle;
    if (!handle) {
      setProfileImageUrl(null);
      setProfileExists(false);
      return;
    }

    let isActive = true;
    const loadProfileImage = async () => {
      try {
        const response = await fetch(`${API_BASE}/profiles/${handle}`, {
          headers: apiKey ? { "x-api-key": apiKey } : undefined,
        });
        if (!response.ok) {
          if (isActive) {
            setProfileImageUrl(null);
            setProfileExists(false);
          }
          return;
        }
        const json = await response.json();
        const data = json?.data ?? null;
        const imageUrl = data?.image_url ?? json?.image_url ?? null;
        const hasProfile = Boolean(data);
        if (isActive) {
          setProfileImageUrl(imageUrl);
          setProfileExists(hasProfile);
        }
      } catch {
        if (isActive) {
          setProfileImageUrl(null);
          setProfileExists(false);
        }
      }
    };

    loadProfileImage();
    return () => {
      isActive = false;
    };
  }, [address, guestHandle, apiKey]);

  /* ================================ Render ================================ */
  return (
    <header className="top-0 z-50 w-full">
      <div className="relative mx-auto w-full max-w-screen-6xl justify-between lg:justify-center px-6 lg:px-6 xl:px-8">
        {/* Single row as 3-column grid for perfect alignment */}
        <div className="flex justify-between items-center gap-4 sm:gap-3 lg:gap-4 py-3 sm:py-4 md:py-5 lg:py-6">
          {/* Left group: Logo + Search */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 mr-4 sm:mr-0">
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
            <div className="hidden lg:flex flex-1 justify-center">
              <nav className="flex items-center gap-4 xl:gap-10">
                {/* <FindTradersNavItem /> */}
                <Link href={"/createtoken"}>
                  <NavItem label="Create Token" showBlinker />
                </Link>
                <ExploreNavItem />

                <Link href={"/wallet-tracker"}>
                  <NavItem label="Wallet Analyzer" showBlinker/>
                </Link>
                {/* <NavItem label="Earn" hasDropdown />
                <NavItem label="Terminal" hasDropdown />
                <NavItem label="Resources" hasDropdown /> */}
                {/* <Link href={'https://leaderboard.degenter.io'} target="_blank"><NavItem label="Leaderboard" showBlinker /></Link> */}
                {/* <TerminalNavItem /> */}
                {/* <LeaderboardNavItem /> */}
              </nav>
            </div>

            <div className="flex items-center gap-3 sm:gap-2 md:gap-3">
              <div className="relative">
                <button
                  ref={profileButtonRef}
                  onClick={handleProfileClick}
                  className="flex items-center justify-center rounded-lg text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  aria-label="Portfolio"
                  type="button"
                >
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt="Profile"
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : profileExists ? (
                    <Image
                      src={ProfilePIC}
                      alt="Profile"
                      width={22}
                      height={22}
                      className="w-5 h-5 object-contain select-none"
                      draggable={false}
                    />
                  ) : (
                    <Image
                      src={ProfileImg}
                      alt="Profile"
                      width={22}
                      height={22}
                      className="w-5 h-5 object-contain select-none"
                      draggable={false}
                    />
                  )}
                </button>
                {showProfileIntro && (
                  <div
                    className="absolute right-0 top-full z-30 mt-2 ml-2 w-[min(250px,calc(100vw-1.5rem))] transform-gpu rounded-2xl border border-white/15 bg-[#0c0c0c]/95 p-3 shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
                    role="dialog"
                    aria-live="polite"
                  >
                    <div className="absolute right-3 -top-2 h-3 w-3 rotate-45 rounded-sm border-t border-l border-white/15 bg-[#0c0c0c]/95" />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#39C8A6]">
                        Profile
                      </p>
                      <button
                        type="button"
                        className="text-[11px] text-white/60 transition hover:text-white"
                        onClick={dismissProfileIntro}
                        aria-label="Dismiss profile intro"
                      >
                        ✕
                      </button>
                    </div>
                    {!address ? (
                      <div className="mt-4 text-center">
                        <p className="text-sm text-white/80 mb-4">
                          Create your profile with a unique ID and update it
                          anytime.
                        </p>
                        <button
                          onClick={() => {
                            dismissProfileIntro();
                            router.push("/profile");
                          }}
                          className="w-full py-2 bg-[#32816E] rounded-md hover:bg-[#3a9a82] transition-colors flex items-center justify-center gap-2"
                        >
                          <span>Create Profile</span>
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm leading-relaxed text-white/80">
                        Your profile is where you check your portfolio, track
                        achievements, and keep your wallet details ready.
                        It&apos;s the entry point to manage settings,
                        preferences, and view your live stats.
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
                      <span>Tap to explore</span>
                      <button
                        type="button"
                        className="rounded-full border border-white/30 px-3 py-1 text-[10px] font-semibold text-white/80 transition hover:border-white/60 hover:text-white"
                        onClick={dismissProfileIntro}
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <span
                aria-hidden
                className="mx-2 sm:mx-1 h-6 sm:h-7 w-[1px] bg-white"
              />
              {!address ? (
                <button
                  onClick={handleWalletClick}
                  className="relative flex h-[44px] w-auto items-center justify-center"
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
              {/* <FindTradersNavItem /> */}
              <Link href={"/createtoken"}>
                <NavItem label="Create Token" showBlinker />
              </Link>
              <ExploreNavItem mobile />
              <NavItem label="Wallet Analyzer" hasDropdown />
              {/* <NavItem label="Earn" hasDropdown />
              <NavItem label="Terminal" hasDropdown /> */}
              {/* <TerminalNavItem /> */}
              {/* <NavItem label="Resources" hasDropdown /> */}
              <LeaderboardNavItem mobile />
              <Link
                href="http://zigscan.org/"
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
  showBlinker,
}: {
  label: string;
  hasDropdown?: boolean;
  showBlinker?: boolean;
}) {
  return (
    <div className="relative group text-white text-sm">
      <div className="flex items-center gap-2 cursor-pointer hover:text-gray-300 transition">
        <span className="whitespace-nowrap">{label}</span>
        {showBlinker && (
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
  return (
    <Link
      href="https://leaderboard.degenter.io"
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-2 ${mobile ? "px-2 py-1" : ""}`}
    >
      <NavItem label="Leaderboard" />
      <span
        className="relative ml-2 flex h-4 w-2 items-center"
        aria-label="New"
        title="New"
      >
        <span className="absolute inline-flex h-2 w-2 rounded-full bg-[#FA4E30] opacity-75"></span>
        <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-[#FA4E30]"></span>
      </span>
    </Link>
  );
}

function ExploreNavItem({ mobile }: { mobile?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const openMenu = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    if (!isOpen) setIsOpen(true);
  };

  const closeMenu = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const menuItems = [
    {
      icon: FaSearch,
      title: "Find Trades",
      subtitle: "Find the best trading opportunities",
      href: "/trades",
      locked: false,
      isNew: true,
    },
    {
      icon: FaGem,
      title: "Find Gems",
      subtitle: "Discover hidden gems",
      href: "/findgems",
      locked: false,
      isNew: true,
    },
    {
      icon: FaLink,
      title: "Zigscan Explorer",
      subtitle: "Explore the blockchain",
      href: "https://zigscan.org",
      locked: false,
      external: true,
    },
    {
      icon: FaTrophy,
      title: "Leaderboard",
      subtitle: "Top traders and tokens",
      href: "https://leaderboard.degenter.io",
      locked: false,
      external: true,
      isNew: true,
    },
    {
      icon: FaPlusCircle,
      title: "Multi Charts",
      subtitle: "Access multiple charting tools, trades and tokens stats",
      href: "/multicharts",
      locked: false,
      isNew: true,
    },
    {
      icon: FaChartLine,
      title: "Insight",
      subtitle: "Market insights and analytics",
      href: "/",
      locked: true,
    },
  ];

  if (mobile) {
    return (
      <div className="w-full">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between px-2 py-1 text-left text-white"
        >
          <span className="flex items-center gap-2">
            <span>Explore</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {isOpen && (
          <div className="mt-2 rounded-lg bg-black p-4 backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-4">
              {menuItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.href}
                  target={item.external ? "_blank" : "_self"}
                  rel={item.external ? "noreferrer noopener" : ""}
                  className={`group flex items-start space-x-3 rounded-lg p-3 transition-colors ${
                    item.locked ? "" : "hover:bg-gray-800"
                  }`}
                  onClick={() => setIsOpen(false)}
                  aria-disabled={item.locked}
                >
                  <item.icon className="text-2xl text-gray-400 group-hover:text-[#FA4E30] transition-colors" />
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-white">
                        {item.title}
                      </span>
                      {item.locked && (
                        <Lock className="ml-2 h-3 w-3 text-gray-400" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {item.subtitle}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="flex items-center relative"
        onMouseEnter={openMenu}
        onMouseLeave={closeMenu}
      >
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded-lg transition-colors  group">
          <div className="flex items-center">
            <span className="relative">Explore</span>
            <span
              className="relative ml-2 flex h-4 w-2 items-center"
              aria-label="New"
              title="New"
            >
              <span className="absolute inline-flex h-2 w-2 rounded-full bg-[#FA4E30] opacity-75"></span>
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-[#FA4E30]"></span>
            </span>
          </div>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {isOpen && (
        <div
          className="absolute right-0 mt-1 w-[min(600px,calc(100vw-2rem))] rounded-lg bg-black border border-gray-800 p-4 shadow-2xl z-[1000]"
          onMouseEnter={openMenu}
          onMouseLeave={closeMenu}
        >
          <div className="grid grid-cols-2 gap-3">
            {menuItems.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                target={item.external ? "_blank" : "_self"}
                rel={item.external ? "noreferrer noopener" : ""}
                className={`group flex items-start space-x-3 rounded-lg p-3 transition-colors ${
                  item.locked ? "" : "hover:bg-gray-800"
                }`}
                aria-disabled={item.locked}
                onClick={() => setIsOpen(false)}
              >
                <div className="flex-shrink-0 p-2 rounded-lg bg-black group-hover:bg-yellow-500/10 transition-colors">
                  <item.icon className="text-xl text-gray-400 group-hover:text-[#FA4E30] transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white truncate">
                      {item.title}
                    </span>
                    {item.isNew && (
                      <span className="relative ml-2 flex h-4 w-2 items-center">
                        <span className="absolute inline-flex h-2 w-2 rounded-full bg-[#FA4E30] opacity-75"></span>
                        <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-[#FA4E30]"></span>
                      </span>
                    )}
                    {item.locked && (
                      <Lock className="ml-2 h-3 w-3 text-gray-400" />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {item.subtitle}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function TerminalNavItem({ mobile }: { mobile?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const openMenu = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    if (!isOpen) setIsOpen(true);
  };

  const closeMenu = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const menuItems = [
    {
      icon: FaSearch,
      title: "Multi Charts",
      subtitle: "Access multiple charting tools, trades and tokens stats",
      href: "/multicharts",
      locked: false,
      isNew: true,
    },
    {
      icon: FaGem,
      title: "Alert",
      subtitle: "Set up custom alerts for your trades and tokens",
      href: "/",
      locked: true,
    },
    {
      icon: FaLink,
      title: "Label",
      subtitle: "Add labels to your trades and tokens",
      href: "/",
      locked: true,
      external: false,
    },
    {
      icon: FaPlusCircle,
      title: "Watchlist",
      subtitle: "Create and manage your watchlists",
      href: "/",
      locked: true,
    },
    {
      icon: FaChartLine,
      title: "Insight",
      subtitle: "Market insights and analytics",
      href: "/",
      locked: true,
    },
  ];

  if (mobile) {
    return (
      <div className="w-full">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between px-2 py-1 text-center text-white"
        >
          <span className="flex items-center gap-2">
            <span>Terminal</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        {isOpen && (
          <div className="mt-2 rounded-lg bg-black p-4 backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-4">
              {menuItems.map((item, index) => (
                <Link
                  key={index}
                  href={item.href}
                  target={item.external ? "_blank" : "_self"}
                  rel={item.external ? "noreferrer noopener" : ""}
                  className={`group flex items-start space-x-3 rounded-lg p-3 transition-colors ${
                    item.locked ? "" : "hover:bg-gray-800"
                  }`}
                  onClick={() => setIsOpen(false)}
                  aria-disabled={item.locked}
                >
                  <item.icon className="text-2xl text-gray-400 group-hover:text-[#FA4E30] transition-colors" />
                  <div className="flex-1">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-white">
                        {item.title}
                      </span>
                      {item.locked && (
                        <Lock className="ml-2 h-3 w-3 text-gray-400" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {item.subtitle}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="flex items-center relative"
        onMouseEnter={openMenu}
        onMouseLeave={closeMenu}
      >
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded-lg transition-colors  group">
          <div className="flex items-center">
            <span className="relative">Terminal</span>
            <span
              className="relative ml-2 flex h-4 w-2 items-center"
              aria-label="New"
              title="New"
            >
              <span className="absolute inline-flex h-2 w-2 rounded-full bg-[#FA4E30] opacity-75"></span>
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-[#FA4E30]"></span>
            </span>
          </div>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {isOpen && (
        <div
          className="absolute right-0 mt-1 w-[min(600px,calc(100vw-2rem))] rounded-lg bg-black border border-gray-800 p-4 shadow-2xl z-[1000]"
          onMouseEnter={openMenu}
          onMouseLeave={closeMenu}
        >
          <div className="grid grid-cols-2 gap-3">
            {menuItems.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                target={item.external ? "_blank" : "_self"}
                rel={item.external ? "noreferrer noopener" : ""}
                className={`group flex items-start space-x-3 rounded-lg p-3 transition-colors ${
                  item.locked ? "" : "hover:bg-gray-800"
                }`}
                aria-disabled={item.locked}
                onClick={() => setIsOpen(false)}
              >
                <div className="flex-shrink-0 p-2 rounded-lg bg-black group-hover:bg-yellow-500/10 transition-colors">
                  <item.icon className="text-xl text-gray-400 group-hover:text-[#FA4E30] transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white truncate">
                      {item.title}
                    </span>
                    {item.isNew && (
                      <span className="relative ml-2 flex h-4 w-2 items-center">
                        <span className="absolute inline-flex h-2 w-2 rounded-full bg-[#FA4E30] opacity-75"></span>
                        <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-[#FA4E30]"></span>
                      </span>
                    )}
                    {item.locked && (
                      <Lock className="ml-2 h-3 w-3 text-gray-400" />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {item.subtitle}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
